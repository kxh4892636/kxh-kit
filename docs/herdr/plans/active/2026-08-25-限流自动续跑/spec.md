---
status: completed
---

# 限流自动续跑

## 问题

多智能体操作者需要 Herdr 自动发现当前 session 所有 workspace 中状态为 `idle`、`done` 或 `blocked` 且因上游限流而停顿的 agent，并为每个独立限流停顿至多提交一次 `go on`。Herdr 0.8.2 能暴露 agent 状态、终端快照和输入接口，但没有语义消息边界、受监督的周期任务或向 `blocked` agent 安全提交 prompt 的高层接口。

## 方案

新增一个可由 Herdr link 或从 GitHub subdir 安装的跨平台插件。插件以状态事件作为主触发，以 30 秒自管 worker 作为 best-effort 补偿；两条路径复用同一个“二次确认 → 读取并匹配 → 加锁去重 → 按状态发送 → 持久化结果”应用接口。

首条 tracer bullet 交付可手工调用的 `idle`/`done` 单次扫描纵切，先建立 Herdr socket、匹配和基础持久化 seam；第二条在同一 seam 上加入所有 agent 类型的 `blocked` 单请求输入；第三条接入 `pane.agent_status_changed` 与跨进程互斥；第四条加入 startup worker、生命周期退出和安装诊断，使每一步都保留可运行的用户结果。

## 已排除的备选

- 语义化读取“最新一条消息”：Herdr 0.8.2 没有 conversation/message API，只能读取终端快照。
- 扫描整个 recent buffer：历史残留的 `429` 与 `limit` 会误触发；只检查规范化 `detection` 快照末尾 55 个 Unicode 字符。
- 对 `blocked` 使用 `agent.prompt`：Herdr 会在发送任何输入前返回 `agent_blocked`；按用户确认改用底层 `pane.send_input`。
- 仅支持 Codex 的 blocked 输入：用户确认所有 Herdr 已识别 agent 类型都进入相同策略，不设 kind allowlist。
- 只靠 30 秒轮询：startup 命令不是 Herdr 监督的 daemon；状态事件是主触发，worker 只补偿漏失事件。
- 依赖外部 cron 或系统服务：可提供严格监督，但会让自动续跑不再是自包含 Herdr 插件。
- 只调用 Herdr CLI：CLI `agent.read` 丢失 read revision，且没有 `pane.send_input` wrapper，不能满足单请求输入与发送前修订核对契约。

## 实施决策

### 包与入口

- 新增 workspace package `packages/herdr-limit-resume`，npm 名称 `@kxh4892636/herdr-limit-resume`，使用 TypeScript、ESM、Node.js `>=22.12.0`，不增加运行时第三方依赖。
- package 根放置 `herdr-plugin.toml`；插件 id 为 `kxh.limit-resume`，`min_herdr_version = "0.8.2"`，platforms 为 `linux`、`macos`、`windows`。
- 构建一个 `dist/main.mjs`，以 argv 子命令提供 `scan-now`、`handle-event` 和 `worker` 三个入口；manifest 分别通过 `[[actions]]`、`[[events]]` 和 `[[startup]]` 声明。
- runtime 只从 Herdr 注入的 `HERDR_SOCKET_PATH`、`HERDR_PLUGIN_STATE_DIR`、`HERDR_PLUGIN_ID` 和 event context 取运行环境，不猜测 socket 或用户目录。

### Herdr 端口

- 以 Node `net` 连接 `HERDR_SOCKET_PATH`，使用 newline-delimited JSON 实现请求/响应端口；Unix socket 与 Windows named pipe 走同一入口。
- 每个请求有唯一 id、超时、单一响应解析和连接清理；Herdr error response、畸形 JSON、缺字段、断连与超时都作为外部边界错误记录，不能阻断同轮其他 agent。
- 只依赖 Herdr 0.8.2 protocol 20 中的 `agent.list`、`agent.get`、`agent.read`、`agent.prompt`、`pane.send_input` 与 `plugin.list` shape；解析器忽略未知字段。

### 候选与消息区域

- `agent.list` 的当前 session 全量结果由插件本地过滤；所有 workspace、所有 Herdr 已识别 agent 类型均在范围内。
- 只有 `agent_status` 为 `idle`、`blocked` 或 `done` 的 agent 是候选。
- 对 `agent.read` 的 `detection` text 执行 Unicode 空白序列折叠为单个空格并 trim，再按 Unicode code point 取得末尾 55 个字符；该区域必须同时包含字面量 `429` 与大小写不敏感的 `limit`。
- 空区域、任一 token 缺失、读取失败或协议字段不足时只记录跳过，不发送输入。

### 二次确认与发送

- event payload 只作为唤醒信号；发送前必须调用 `agent.get`，确认 `terminal_id` 未变、状态仍为 `idle`、`blocked` 或 `done`、`state_change_seq` 未被新状态取代，再核对读取 revision 与本次匹配快照一致。
- `idle`/`done` 使用 `agent.prompt { target, text: "go on" }`；`blocked` 使用单个 `pane.send_input { pane_id, text: "go on", keys: ["enter"] }` 请求。
- `blocked` 输入明确绕过 Herdr 的 agent 保护；除上述 occupant、状态、修订和匹配检查外，不提供 agent kind allowlist。
- API 返回发送成功只证明 Herdr 接受输入；后续状态未变化时记录诊断但不得盲目重发。

### 去重、并发与状态

- 持久状态按 `HERDR_SOCKET_PATH` 的哈希分片，避免全局安装的插件在多个 session 之间互相抑制。
- 每个 agent 以 `terminal_id` 定位；处理指纹由 `terminal_id` 与规范化 55 字符区域的哈希组成，不把 `idle`/`blocked`/`done` 之间的状态差异当成新停顿。
- 观察到 agent 进入 `working` 或 `unknown` 后，才解除该 terminal 已处理指纹；`done` 因聚焦变为 `idle` 时不得解除，避免同一限流停顿重复发送。它之后经过非候选状态再进入候选状态时，即使限流文本相同也可构成新停顿。
- event handler、手工扫描和 worker 使用基于 `open(..., "wx")` 的逐 terminal 文件锁；锁文件包含 owner 与时间，按明确过期策略恢复异常退出遗留锁。
- 只有发送成功后才以临时文件加 rename 原子持久化处理指纹；重启后 agent 与指纹未变化时不得重复发送。

### 触发与生命周期

- `[[events]] on = "pane.agent_status_changed"` 调用 `handle-event`；只处理进入 `idle`、`blocked` 或 `done` 的事件，但发送前仍执行完整二次确认。
- `[[startup]]` 调用 `worker`；每个 session 只允许一个 worker，启动时立即扫描一次，之后每 30 秒扫描。
- worker 每轮先用 `plugin.list` 确认 `kxh.limit-resume` 仍存在且 enabled；disable 或 uninstall 后退出，不再产生检查或输入。
- Herdr 不监督 worker；worker 意外退出后等待下一次 Herdr restore/live handoff 重启。安装文档明确 link/enable 本身不会触发 startup，需要重启或 handoff server。
- 诊断使用不含原始终端文本的 JSON Lines，记录时间、session 分片、terminal/pane 标识、触发源、结果码和区域哈希；文件大小受限并可轮换。

## 工作环境

- 工作区：Windows PowerShell；Node `24.19.0`；Corepack 提供锁定的 `pnpm@11.22.0`，Vite Plus `0.2.6`；所有 pnpm 命令使用 `corepack pnpm`。
- Herdr：本机 `0.8.2`，socket protocol `20`；实现与测试以本机 `herdr api schema --json` 和官方 0.8.2 CLI 行为为契约。
- 目标平台：Windows named pipe、Linux/macOS Unix socket。
- 开发链接：`herdr plugin link packages/herdr-limit-resume --disabled` 用于无自动执行的 manifest 验证；运行态 smoke 在隔离 Herdr session 或假 socket server 中执行，不重启当前工作 session。
- 仓库门禁：插件包级 `check`、`test`、`build`，领域校验 `node .agents/skills/loop-x/script/check-domain.mjs .`，以及隔离 Herdr/fake socket runtime smoke。
- 已知基线：准入时根 `corepack pnpm exec vp check` 因 972 个既存文件的格式问题失败；这些文件不属于本插件范围，因此根 `pnpm ready` 不作为本 Plan 的交付门禁，也不允许为通过门禁而批量改写无关文件。

## 范围

- Herdr plugin manifest、构建与安装说明。
- Herdr NDJSON socket 端口及假 server 测试端口。
- 当前 session 全 workspace 的候选筛选、55 字符消息区域匹配、二次确认、两种发送策略。
- 跨进程锁、跨重启去重、状态事件、30 秒补偿 worker、结构化诊断和安全退出。

## 非范围

- 修改 Herdr core、agent detection manifest 或任何 coding agent 本身。
- 保证“最新 55 字符”等价于语义上的最新 agent 消息。
- 识别 429/limit 之外的错误、自动计算 backoff 或等待限流窗口。
- 为 `blocked` 对话理解审批语义，或为不同 agent 类型定制按键。
- 使用外部 cron、Windows service、systemd/launchd 监督 worker。
- 发布 marketplace、添加 GitHub topic，或保证尚未验证的 Herdr 版本兼容。
- 修复本 Plan 开始前已经存在的全仓格式基线或其他无关工作树改动。

## 待定

无。

## 上下文

- [用户故事](story.md)
- [Herdr Plugins](https://herdr.dev/docs/plugins/)
- [Herdr Agent automation](https://herdr.dev/docs/agent-automation/)
- [Herdr Socket API](https://herdr.dev/docs/socket-api/)
- [Herdr 领域语言](../../../CONTEXT.md)

## Issue

| #   | Issue                                                             | 状态      | 阻塞于 | 下一步     |
| --- | ----------------------------------------------------------------- | --------- | ------ | ---------- |
| 01  | [`idle`/`done` 限流停顿续跑纵切](01-idle-done限流停顿续跑纵切.md) | completed | —      | /implement |
| 02  | [`blocked` 限流停顿续跑](02-blocked限流停顿续跑.md)               | completed | 01     | /implement |
| 03  | [状态事件自动续跑](03-状态事件自动续跑.md)                        | completed | 02     | /implement |
| 04  | [补偿扫描与插件生命周期](04-补偿扫描与插件生命周期.md)            | completed | 03     | /implement |
