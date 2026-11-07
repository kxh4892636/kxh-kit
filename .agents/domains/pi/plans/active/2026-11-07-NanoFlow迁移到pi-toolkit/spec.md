# Nano Flow 迁移到 pi-toolkit

## 目标

把 `packages/dsh-toolkit/src/nano-flow` 的交付流程迁移到 `packages/pi-toolkit`：第四个开关、`/nano-flow` 四选一模式、固定提示词、三个 `nano_flow_*` 工具、`ask_questions`、随包 skill、取消压缩与就地清空上下文。不迁移预设 roster、Web ready 面板与自动新建会话轮转。

## 方案

### 目录

```
packages/pi-toolkit/src/nano-flow/
├── config.ts        # NanoFlowSettings + 默认值 + 校验
├── dag.ts plan.ts store.ts check-runner.ts   # 原样移植
├── scripts/check-domain.mjs                  # 原样移植（唯一校验实现）
├── assets.ts        # import.meta.url 定位 prompt/skills/script
├── prompt.md        # 改为 pi 的 /skill: 与 ask_questions 口径
├── skills/          # 6 个随包 skill（ask/do 引用已改写）
├── tools/           # 三个工具：TypeBox schema + pi 工具返回
├── ask.ts           # ask_questions：逐题选项/自定义/跳过
├── mode.ts          # mode entry、reset marker、恢复种子
├── selector.ts      # /nano-flow 的 SelectList 面板
└── register.ts      # 接线：开关、提示词 section、工具激活、收口、清空
```

### 开关与模式

- `settings.ts` 增加 `tools.nanoFlow` 与 `nanoFlow` 配置节（10 个上限 + `always`）；`DEFAULT_TOOLS` 仍全部 `false`。
- 生效值 = `tools.nanoFlow && (sessionMode ?? nanoFlow.always)`；sessionMode 取分支最后一条 `nano-flow-mode` 自定义 entry。
- `/nano-flow` 选择器四项：`一直开` / `一直关` 写 `nanoFlow.always` 并追加 session entry；`当前会话开` / `当前会话关` 只追加 entry。
- `--nano-flow` flag：配置加载完成后的 `session_start` 若无 session entry 则追加 enabled。
- 配置加载顺序：入口的 `session_start` 先加载 `pi-toolkit.json`，再调用 `nanoFlow.start(ctx)`；避免模块注册顺序导致读默认值。

### 提示词、工具与 skill

- `before_agent_start`：模式生效时 `event.systemPromptOptions.sections["nano_flow"] = prompt.md`，按 section diff 注入。
- 四个工具随包注册为 `defaultActive: false`；模式生效时 `setActiveTools()` 追加，关闭时移除，其它工具不动。
- `resources_discover`：开关打开时返回随包 `skills/` 根；与 `nestedSkills` 一样需要 `/reload` 才可见。

### 取消压缩与就地清空

- `session_before_compact`：模式生效时 `{ cancel: true }`。
- `input`：`getContextUsage().tokens / contextWindow ≥ rotateAt` 时追加 `nano-flow-reset` entry（`{at: Date.now()}`），`resetPending` 防止同一轮重复追加。
- `context`：取最近 reset 标记，过滤 `timestamp < at` 的模型消息，前置合成的 user 种子（`buildSeed`：唯一的 active Plan 直接点名，否则提示先确认）。
- 不清空 TUI 转录、不新建/删除会话；退出模式后不再过滤，恢复 pi 压缩。

### ask_questions

- `questions[]` 无数量上限；每题 `question` 必填，`options[{label, description?}]` 可空，`allow_custom` / `allow_skip` 默认 true。
- 交互用 `ctx.ui.select` + `ctx.ui.input` 逐题询问；TUI/RPC 之外返回错误文本。
- Esc 取消：保留已完成答案并标记 cancelled。

### notes.json 收口

`tool_call` 在模式生效时扫描非 `nano_flow_*` 工具的参数：任何字符串出现 `notes.json` 即 block；策略级，与 DSH 的「不是安全边界」一致。

## 已排除的备选

- **保留 Agent 预设**：pi 无 `agentPresets`，预设 roster 与 20 个插件行无法对应。
- **开关即全局注入提示词**：污染普通会话；改为开关 + 每会话模式。
- **自动轮转（新建/删除会话）**：`ctx.newSession` 仅命令上下文，删除会话无扩展 API。
- **用 `ctx.compact()` 替代清空**：摘要仍留在上下文，不满足"所有上下文清空"。
- **ready 面板**：pi widget 不可交互，用户明确不需要面板；查询走命令与工具。
- **纯文本提问替代工具**：ask 循环需要结构化选项与跳过。

## 实施决策

- `settings.ts` 的 `nanoFlow` 节用 `parseNanoFlowSettings()` 校验；`saveNanoFlowAlways()` 只合并 `nanoFlow.always`，保留其它键。
- `/toolkit` 面板只增加一行开关；数值仍编辑 JSON。
- `registerNanoFlow()` 返回 `{ start, sync }`：入口在配置加载后调用 `start`，`/toolkit` 切换后调用 `sync`。
- `tools/shared.ts` 的 `workspace(ctx)` 直接返回 `ctx.cwd`；不再需要宿主 `workingDirectory` 服务。
- `check-runner.ts` 仍用 `process.execPath` 调用 `check-domain.mjs`，`ELECTRON_RUN_AS_NODE=1` 保留。
- 测试：移植 `dag.test`，新增 `plan` / `mode` / `selector` / `ask` / `register` / `tools` 测试；覆盖率维持 80% 阈值。

## 工作环境

- 宿主：pi 1.5.0；`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox` 为 peer 依赖。
- 包由 jiti 直接加载 TS，无构建步骤；资产位于 `src/nano-flow/`。
- 仓库：`kxh-kit`（`main`），Node v24.21.0、pnpm 11.22.0。
