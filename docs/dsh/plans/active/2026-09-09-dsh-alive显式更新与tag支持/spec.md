---
status: in_progress
---

# dsh-alive 显式更新与 tag 支持

## 问题

已交付的 `packages/dsh-keep-alive` 在启动后立即并每 13 小时后台检查并自动切换 DSH 版本，切换可能中断正在执行的任务；用户要求移除该自动机制，改为显式命令，并支持发布标签（tag）。

## 方案

把「版本检查与安装」从后台周期任务改为命令触发的显式动作：`start` 每次解析当前通道的版本，有新版则安装后启动；新增 `update` 只准备版本（安装并记录），不启动、不重启；通道按端口记忆，缺省 `latest`；移除周期调度与相关状态字段，保留「新版启动失败回退上一可运行版本」。

## 已排除的备选

- `update` 无新版也重启：无故中断正在执行的任务，「确保在跑」已由 `start` 覆盖（Q1）。
- `update` 拉起未运行实例或重启运行中实例：用户明确「update 只更新，不启动」（Q2）。
- 查询失败即拒绝启动：削弱既有的「已缓存版本可离线启动」承诺（Q3）。
- 不记忆通道：`start --tag alpha` 之后一次裸 `update` 会静默切回 `latest`（0.1.5-alpha.1 → 0.1.2-rc.1，实为降级）（Q4）。
- 闭集校验 tag：dist-tag 由发布方定义且会变化，每加一个通道都要改代码发版（Q5）。
- 移除启动失败回退：回退属「更新失败处理」，保证一次坏更新不让实例停摆（Q6）。
- 版本号升到 0.0.2 并重新产出 tarball 交付物：沿用上一轮 Q8=B 口径，交付物为代码、测试与文档（Q7）。
- 用 semver 大小比较决定是否更新：跨通道比较大小无意义（alpha 0.1.5-alpha.1 与 latest 0.1.2-rc.1），跟随通道当前版本才是语义。

## 实施决策

### 协议与 CLI（`src/contract.ts`、`src/main.ts`）

- `requestSchema`：`start` 与新增的 `update` 都携带 `launch` 与 `tag`；`stop`、`status` 不变。
- `statusSchema`：删除 `nextUpdateAt`；新增 `tag: z.string().nullable()`（当前通道）与 `prepared: z.string().nullable()`（已安装并记录、尚未成为运行版本的版本）。
- CLI：`start`、`update` 接受 `--port N` 与 `--tag T`（顺序无关、各至多一次；未知参数或多余参数报错）；`stop`、`status`、`logs` 不接受 `--tag`。帮助文本列出 `update [--port N] [--tag T]`，说明 `--tag` 缺省 `latest`，并列举 `latest`/`alpha`/`next`。
- tag 校验：`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`，并拒绝形如 semver 的输入；通道是否存在交给 npm 判断。

### 版本准备（`src/runtime/versions.ts`）

- `installLatest` 改为 `installTag(directory, launch, tag, npm)`：`npm view @deepseek-ai/dsh@<tag> version --json` 解析精确版本；命中已安装目录直接复用；安装仍在临时目录完成后原子改名。
- 源兜底：npm 命令报「源里没有该包或版本」（`ETARGET`/`E404`/`No matching version`）时，改用 `https://registry.npmjs.org` 重试一次；两次都失败则报错并保留两段原因。网络故障不触发回退，避免等待翻倍——本机配置源为 npmmirror，缺 `@deepseek-ai/dsh-fs-local@0.1.5-alpha.1`，正是该回退使 alpha 通道可安装。
- `InstanceIo.latest` 改为 `prepare(directory, launch, tag)`，测试替身同步。
- `prepareVersion(paths, launch, tag, prepare)`：CLI 与 supervisor 共用「解析通道版本 → 与该端口 `state.json` 记录比较 → 不同才写入 `{version, tag}` → 返回 `{version, tag, changed}`」这一不变量；`changed` 用于日志与结果说明。
- `readRecordedState` 用 `versionSchema` 与 `tagSchema` 校验磁盘记录：`tag` 缺失或非法按 `latest` 处理并保留版本；内容损坏按「无记录」处理。

### 运行时（`src/runtime/instance.ts`）

- 删除 `UPDATE_INTERVAL`、`scheduleUpdate`、`nextUpdateAt` 与同版抑制状态（`failedVersion`、`observedLatest`）。
- `start(launch, tag)`：准备目标版本（失败时回退 `state.json` 缓存版本并记录错误）→ 停止现有实例 → 启动；重复 `start` 即重启（既有行为）。
- `update(launch, tag)`：准备目标版本；有变化则安装并记录，**不启动、不重启**；无变化则不做任何事。运行中的实例保持原版本与原 PID；崩溃恢复仍启动正在运行的版本。两条路径都向该端口日志写入 `Prepared DSH <version> (tag <tag>)` 或 `No change for tag <tag> (DSH <version>)`，使「是否发生更新」可复核。
- `status`：`tag`/`prepared` 在 supervisor 启动时从 `state.json` 恢复；`prepared` 表示「下次 `start` 将启动的版本」，当它与当前运行版本不同时显示（无运行版本时即记录版本），`start` 启动后清空。
- 回退候选优先取正在运行的版本（已知可启动），其次取 `state.json` 记录版本；`state.json` 丢失时仍能回退。
- `start` 先准备目标版本再停止现有实例：准备期间旧实例继续服务且仍受保活；准备失败且无回退版本时不动正在运行的实例，只记录错误。
- 崩溃恢复只重启正在运行的版本；此前 `update` 记录的新版本会被恢复时的成功启动按运行版本重写 `state.json`（通道保留），下次 `start`/`update` 会重新解析。
- 保留：新版启动失败 → 回退上一可运行版本并启动，`status.error` 记录 `Rolled back …`；回退也失败则 `failed` 并清理进程。

### 命令层（`src/commands.ts`）

- 新增 `update(port, launch, tag, paths)`：该端口 supervisor 存在时发 `update` 请求（与其 start/stop 串行）；不存在时在 CLI 进程内直接准备版本（不拉起 supervisor、不启动实例），并合成 `stopped` 状态返回。
- `update` 查询或安装失败时以错误退出，不改变已有版本；`start` 则回退缓存版本继续启动。
- 旧版 supervisor 兼容：状态回复缺少 `tag` 字段即判定为旧版（`status` 的 `tag`/`prepared` 因此可选）。`start` 先让旧版退出、**等到控制通道不再应答**再拉起新版接管该端口（否则 start 可能被旧版接管或新版 listen 撞上未释放的管道），并拒绝缺少 `tag` 的应答；`update` 明确报错要求先执行 `start`——接管旧版必须停止实例，与「update 只更新、不启动」冲突。
- 没有 supervisor 时的 `status` 从 `state.json` 报告通道与下次 `start` 将启动的版本；新建 supervisor 以同一来源初始化 `tag`/`prepared`，同一端口两种来源给出相同答案。

### 状态文件

- `%LOCALAPPDATA%/dsh-keep-alive/<port>/state.json` 由 `{version}` 扩展为 `{version, tag}`；缺 `tag` 视为 `latest`，无需迁移。

## 工作环境

Windows / PowerShell；仓库使用 pnpm 与 vite-plus，本机 Node.js v24.19.0。`%LOCALAPPDATA%\dsh-keep-alive\3080` 有运行中的受管实例（当前 DSH Web 界面由它提供），验证不得停止、重启或切换它；真实 npm 冒烟使用隔离 `LOCALAPPDATA` 与独立端口。npm registry 可访问，`@deepseek-ai/dsh` 当前 dist-tags 为 `alpha=0.1.5-alpha.1`、`latest=0.1.2-rc.1`、`next=0.1.2-rc.1`。测试使用替身与真实进程，不调用模型。

## 范围

- 01：版本准备按 tag 参数化（prefactoring，行为不变）。
- 02：移除自动更新，新增 `update` 命令、`start` 检查更新、通道记忆与状态字段，同步 README。
- 03：真实 npm 通道切换冒烟、领域文档同步与仓库回归证据。

各项包含自己的测试、验证与提交。

## 非范围

自动重启与开机自启、定时任务替代品、按版本号固定（`--tag 1.2.3`）、semver 大小比较、macOS/Linux 支持、DSH 本身功能、包名/状态目录/命名管道改名、模型调用测试。

## 待定

无未决产品选项。交付阶段已逐项验证：`npm view @deepseek-ai/dsh@alpha version --json` 解析、`update` 后运行版本不变而 `state.json` 记录新版、`start` 切到 `0.1.5-alpha.1` 与回 `0.1.2-rc.1`、显式触发下的回退路径、覆盖率 ≥80%（证据见 Issue 03 交付记录）。

已知上游事实：本机配置源 `https://registry.npmmirror.com` 缺 `@deepseek-ai/dsh-fs-local@0.1.5-alpha.1`（官方源存在），alpha 通道因此依赖源兜底才能安装；`@deepseek-ai/dsh@0.1.5-alpha.1` 本身可正常启动（未认证首页返回 401）。

## 上下文

- [领域语言](../../../CONTEXT.md)
- 设计确认记录：工作区 `.flow/quest/2026-09-09-dsh-alive显式更新与tag支持.md`
- [上一轮交付](../../reference/2026-09-09-dsh-alive命令与测试基建调整/spec.md)
- [自动更新的原始交付](../../reference/2026-09-08-终端后台保活工具/02-自动更新与失败回退.md)

## Issue

| #   | Issue                                                                | 状态        | 阻塞于 | 下一步         |
| --- | -------------------------------------------------------------------- | ----------- | ------ | -------------- |
| 01  | [版本准备按 tag 参数化](01-版本准备按tag参数化.md)                   | completed   | —      | /code-delivery |
| 02  | [移除自动更新与显式 update 命令](02-移除自动更新与显式update命令.md) | completed   | 01     | /code-delivery |
| 03  | [真实通道切换冒烟与文档同步](03-真实通道切换冒烟与文档同步.md)       | in_progress | 02     | /code-delivery |
