---
name: 'pi-toolkit插件'
description: '按 pi 接缝重建工具包：嵌套 skill 与会话命名、DeepSeek 网页工具、ask_questions、Nano Flow 交付流程，全部开关与配置落一个 JSON。'
status: 'completed'
---

# pi-toolkit插件

## 问题

`packages/pi-toolkit` 在 2026-11-08 被整体删除，四个能力（嵌套 skill 与 `$` 引用、会话自动命名、DeepSeek 网页搜索与抓取、ask_questions）随之消失，`~/.pi` 里只剩指向已删目录的失效包声明。用户要求按 `dsh-toolkit` 的设计重建：一个包、每个工具独立开关、UI 与 pi 的 `/settings` 同形，并且 pi-toolkit 的全部配置统一用一个 JSON 维护。

## 方案

- 恢复 `packages/pi-toolkit`，入口 `src/index.ts` 只做装配：读一次设置、注册 `/toolkit`、把三个工具接上各自的接缝。
- `src/settings.ts` 是唯一配置层：`~/.pi/agent/pi-toolkit.json` → `<cwd>/.pi/pi-toolkit.json` → `$PI_TOOLKIT_CONFIG` 深合并，缺省值内建，`/toolkit` 写回最高优先级的已存在文件。
- `src/panel.ts` 复用宿主 `SettingsList` / `getSettingsListTheme()` / `DynamicBorder`，三行开关（`nested-skill`、`session-name`、`pi-deepseek-web`），默认全关。
- `src/skills/*`：`resources_discover` 补交内建扫描看不见的嵌套 `SKILL.md`；`$` 触发补全；提交前把可解析的 `$name` 展开成与宿主 `/skill:` 同形的 `<skill>` 块。
- `src/naming/*`：首个用户输入到达时用当前模型生成标题并经 `pi.setSessionName()` 落库；先剔除 skill 调用，模型不可用或失败时退化为确定性截断。
- `src/web/*`：`web_search` 与 `web_fetch` 走 DeepSeek 官方 Search/Fetch API（`POST /v1/tools/search`、`POST /v1/tools/fetch`），模型只能给查询与 URL，其余是部署策略。
- `src/ask/*`：`ask_questions` 让模型一次提出一到多个问题并阻塞等待；TUI 用一个组件管理全部题目，另有独立「提交」页，未作答会拦下提交；非交互退回顺序问答，无 UI 时返回 `needs=answer` 登记。**不引入 orchestrator 的任何逻辑**。

## 已排除的备选

- **保留三个独立包、各读各的配置**：与「一份配置 + 一个面板」直接冲突，且安装顺序会互相牵制。
- **把 web 工具继续拆成 `pi-deepseek-web` 子包、由 toolkit 依赖**：pi 的包安装不解决跨包配置共享，用户仍需装两次；工具身份仍在 `/toolkit` 行里保留 `pi-deepseek-web` 名称。
- **网页搜索走 Anthropic Messages + 服务端 `web_search` 工具**：已被官方 Search/Fetch API 取代，旧方案在 2026-10-17 退役。
- **会话命名做成模型工具让模型自己调用**：命名应在首个输入时自动发生，工具调用时机不可控，且会污染工具目录。
- **面板里编辑数值参数**：与 pi `/settings` 的开关语义不一致，且 pi 没有为扩展配置提供 schema 渲染；参数只留在 JSON。

## 约束与澄清

- 2026-11-09（原始要求）：以 `dsh-toolkit` 为设计来源，每个工具具有自己的开关，UI 参考 pi 的 `/settings`。
- 2026-11-09（原始要求）：嵌套 skill 工具在 pi 中以 `$skill-name` 触发，而不是 dsh 的目录补交形态。
- 2026-11-09（原始要求）：网页工具按官方文档复刻 dsh 的 web search/fetch 契约，pi-toolkit 所有配置统一用一个 JSON。
- 2026-11-09（原始要求）：先不接 `log.jsonl`；后续移植 nano-flow 工具时再确认。
- 2026-11-09（已确认）：三个工具的开关默认关闭；打开前不注册激活工具、不发现、不展开、不命名。
- 2026-11-09（补充要求）：补上历史 `ask_questions` 工具，但它只能作为独立工具存在；orchestrator 的状态、账本、派工、提示词与 skill 一律不引入。

## 范围

- `packages/pi-toolkit` 源码、单测、示例配置与 README（含 `ask_questions`）。
- 本机 `~/.pi` 的失效包声明清理，安装 `packages/pi-toolkit`，并用非交互会话冒烟。
- Nano Flow 迁移：提示词与 skill、三个文档工具与校验、会话模式与绑定、上下文清空、Note 侧栏。
- 本域文档（CONTEXT、ADR、Plan 与 note）。

## 非范围

- 修改 pi 上游或引入自定义 provider seam。
- npm 发布与真机 TUI 的逐键验收；面板交互由单测覆盖，最终以用户验收为准。

## Nano Flow 迁移（合并）

### 问题

`dsh-toolkit/src/nano-flow` 是 DSH 的 Agent 预设：固定提示词 + GUIDE 快照 + 篇幅限制、`nano_flow_create` / `bind` / `check`、5 个随包 skill、Note 看板、Plan 绑定与轨迹日志、上下文轮转，以及一套只在该预设会话生效的作用域。pi 没有 Agent 预设选择器、没有可自动新建会话的事件接缝、没有会话删除 API，TUI 也没有浏览器 dock 与 hover。需要按 pi 的接缝逐项适配后迁移。

### 方案

- **作用域**：`/toolkit` 新增 `nano-flow` 开关（默认关）决定是否可用；`/nano-flow` 命令按 `/thinking` 的交互给出「开 / 关」，Enter 只改当前会话，`Ctrl+S` 同时写 `nanoFlow.always` 作为新会话默认。会话级状态存 `nano-flow-mode` 自定义条目，生效值 = 开关 ∧ (会话条目 ?? `always`)。
- **提示词**：`before_agent_start` 在生效会话注入 `system.md` + `GUIDE.md` 快照 + `limit.md` 数值块（`systemPromptOptions.sections`）；用户消息触发的 run 追加 `user.md` 提醒。
- **工具**：`nano_flow_create` / `nano_flow_bind` / `nano_flow_check` 以 `defaultActive:false` 注册，生效会话加入激活集合，`execute` 再检查一次；名称保持 snake_case。
- **校验**：直接 import `scripts/check-domain.mjs` 的 `checkWorkspace`，不启子进程；规则、索引生成、模板全部保留。
- **绑定**：`nano_flow_bind` 用 `pi.appendEntry("nano-flow-binding", { planPath, cwd, boundAt })` 写会话条目，最后一条生效；不再有全局绑定表与死条目清理。
- **上下文清空**：`before_agent_start` 读 `ctx.getContextUsage()`，`tokens / contextWindow >= rotateAt` 时写 `nano-flow-reset { at, seed }` 并提示；`context` 事件按 `at` 过滤消息，把 seed 作为首条 user 消息插回。seed = 当前 Plan + 上一轮 assistant 输出（`<rotation-last-output>` 包裹）；本轮用户输入原样保留为普通消息。
- **skill**：`resources_discover` 仅在当前会话生效时返回随包 skills 根；`/nano-flow on` 中途打开时 skill 需要 `/reload` 或新会话才出现，命令提示这一点。
- **Note 侧栏**：只做 fullscreen overlay（右上角 40 列）：当前绑定 Plan 的未完成 note，行 = 中文状态 + note 名；点击出详情卡（概述 / `原因：` / `下一步：`），`×` 或 Esc 关闭。`turn_end` 时重读一次磁盘，不做定时轮询；regular 模式不显示。
- **设置**：9 项上限与 `rotateAt` 全部放进 `pi-toolkit.json` 的 `nanoFlow` 节，只改 JSON，不做设置界面。
- **提示词与 skill 适配**：`ask_user_question` → `ask_questions`；ask / do skill 里委派 subagent 的段落改为当前 agent 用只读工具自查；dream 不迁移。
- **日志**：不写 `log.jsonl`；pi 会话 JSONL 就是轨迹，`turn_end` 同步侧栏一次。

### 已排除的备选

- **保留 Agent 预设选择器**：pi 没有该接缝；用 `/toolkit` 开关 + 会话模式条目替代。
- **自动新建会话完成轮转**：`ctx.newSession` 只在命令上下文可用，事件处理器无法自动调用。
- **物理删除旧会话**：pi 会话是只追加文件，`SessionManager` 无删除 API。
- **独立 `nano-flow.json`**：与「pi-toolkit 全部配置一个 JSON」冲突。
- **Note 面板走浏览器 dock / hover**：pi 是 TUI；改为 fullscreen overlay + 点击卡片。
- **迁移 `log.jsonl` / dream**：当前没有消费方；dream 明确暂不迁移。
- **迁移 PTC / subagent / schedule / present**：DSH 宿主插件，pi 没有对应物。

### 约束与澄清

- 2026-11-09（用户）：`/toolkit` 开关控制 nano-flow 工具是否可用；`/nano-flow` 参考 `/thinking` 的 UI 与交互，on/off，并可保存默认。
- 2026-11-09（用户）：不新建会话，在原会话继续；按重置时间过滤历史。
- 2026-11-09（用户）：绑定存会话条目。
- 2026-11-09（用户，2026-11-09 回收确认）：Plan 下要落轨迹文件，但**不沿用 dsh 的 compact log 形态**：内容是 pi 会话条目原样副本，每次 run 末尾（`agent_end`）写一次，不实时写；文件仍在 `.gitignore` 内。
- 2026-11-09（用户）：Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名；点击出卡片（概述 + reason + 下一步）。
- 2026-11-09（用户）：skill 仅在 Nano Flow 会话注入；dream 暂不迁移；提问工具统一 `ask_questions`；subagent 段落改为当前 agent 执行；设置只改 JSON。
- 2026-11-09（用户）：侧栏只做 fullscreen；seed 只包裹上一轮输出，本轮用户输入保留为普通消息。

### 范围

- `packages/pi-toolkit/src/nano-flow/`：提示词、skill、模板、校验脚本、三个工具、模式与绑定、上下文清空、Note 侧栏。
- `src/settings.ts` / `src/panel.ts` / `src/index.ts`：新增 `tools.nanoFlow`、`nanoFlow` 配置节、开关行、命令与接缝。
- 单元测试与真机冒烟；`pi-toolkit.example.json` 与 README。
- 本域文档：CONTEXT 术语、ADR、本 Plan 与 note。

### 非范围

- dream 记忆维护、`log.jsonl`、轮转跟随客户端、PTC / subagent / schedule / present。
- 新会话创建、会话删除、Agent 预设选择器。
- Note 侧栏在 regular 模式的展示。

## 进度

- 2026-11-09：12 条 note 全部 `completed`。001-010 首轮验收通过；011（Note 侧栏）首轮验收后修了 `×` 与卡片位置（改为悬浮在所点行左下侧），二轮走查通过；012 随之收口。
- 2026-11-09：`ask_questions` 曾计划换宿主内置组件，用户决定不改，理由记在 005 的「曾讨论未采纳」。
- 待办：整个 pi-toolkit 改动已随本轮一并提交（pi 包指向仓库路径，重启 pi 即生效）。
- Plan 已无未完成 note，可按用户意愿迁 `reference`。
- 2026-11-09（新需求）：新增 013「dream 手动维护命令」—— 移植 dsh 的 dream，但改为 `/dream` 手动触发、不依赖 seq 游标；实现路径见该 note，决策见 [ADR 004](../../../adr/004-dream由命令手动触发且不依赖seq游标.md)。
- 2026-11-09（用户）：删掉 `prompts/system.md` 的整个「## 入口」章节（优先级判定与「先读对应 skill」），nano-flow 提示词以「工具 / 目录布局 / 语言 / 互链 / 写入边界 / 维护循环」为主干；`[nano-flow:dream]` 前缀也一并从 `prompts/dream.md` 删掉，dream 注入文本改由首句「你是 Nano Flow 的 dream 维护者…」自述身份。同轮执行 `pi install ./packages/pi-toolkit -a` 重新注册包，`settings.json` 无变化。
- 2026-11-09：013 `/dream` 真机验收通过，产出提交 `b814d50`（GUIDE 重写 + common/dsh/music/pi 四域改动）；用户要求本 Plan 全部 note 完成后**继续留在 active**，不迁 reference。
- 2026-11-09：013 代码与提示词落地（240 项测试 + check 全绿），`/dream` 待真机验收；014 Plan 轨迹落盘已验收并 `completed`（含一次性 `backfill` 回填 10 段 / 395 条目，清理了 headless 测试记录）。
- 2026-11-09（新需求）：每日定时跑 `/dream`。取证发现 print 模式发起扩展命令里的 run 会空转（1 ms resolve、零事件、无会话文件），RPC 模式可用；决策与实现路径见 [015](015-定时触发dream.md)，新决策见 [ADR 006](../../../adr/006-定时dream由系统定时器加RPC客户端触发.md)，ADR 004 的「触发」条被其替换。
- 2026-11-09：015 完成并验收。脚本落工作区 `script/dream-daily.mjs`（+ `dream-targets.json`、`script/systemd/`），目标目录按用户指定为 `/home/kongxiaohan.xiaoyu/projects/kxh-workspace`；timer 已启用（下次 2026-11-10 08:01），手动真机一次 3.7 min 跑完，dream 自己提交 `c0f9f47`（11 文件，`GUIDE.md` 从空写成 5737 字节）。真机还暴露一个缺陷：Plan 迁生命周期后 `log.jsonl` 残留旧目录会让 check 报 `spec.md` 缺失，处置与修法见 [问题 001](../../../questions/001-Plan迁生命周期后log残留旧目录.md)。
- 2026-11-09：016 完成。`nano_flow_check` 新增自动修复，按用户选择只做 5 条（spec 状态派生、name 对齐文件名并联动 `related_noted`、非 blocked 去掉 reason、多行头字段折成单行、缺 `questions/` 建目录），输出新增「已自动修复 N 项」；其余一律只报。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
