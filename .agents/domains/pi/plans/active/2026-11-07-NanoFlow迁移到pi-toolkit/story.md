# Nano Flow 迁移到 pi-toolkit

## 原始想法

> mode 不需要预设, 首先是一个 toolkit 的一个开关, 打开后暴露 /nano-flow 命令, 然后可以使用 /nano-flow 命令进行选择一直开, 一直关, 当前会话开, 当前会话关, 就和 /thinking 选择思考强度一样
> 轮转: 启动 nano-flow 时, 直接取消 pi 的压缩功能, 轮转触发时, 直接在当前会话修改, 所有上下文清空, 重新恢复 plan
> ask_user_question: 在 toolkit 中添加 ask_questions 工具, 打开 nano-flow 时必须打开该工具, 支持无限问题, 单个问题可自定义回答可跳过
> 不需要面板, 工具命令可以查询即可

（用户输入，2026-11-07）

## 角色

- **pi 使用者**：在 pi 里使用 DSH 已有的 Nano Flow 交付流程（Plan / story / spec / notes DAG），希望它是一个可选能力，而不是默认接管所有会话。
- **插件维护者**：维护 `packages/pi-toolkit` 与 `packages/dsh-toolkit/src/nano-flow`，需要在保留纯逻辑与工具行为的前提下替换 DSH 的预设、轮转与 Web 面板接缝。

## 故事

### 开关与模式

#### US-001 第四个开关

作为 pi 使用者，我在 `/toolkit` 里只多看到一行 `Nano Flow`，默认关闭；打开后才出现 `/nano-flow` 的能力。

- [x] `tools.nanoFlow` 默认 `false`；关闭时 `/nano-flow` 提示先打开开关，`nano_flow_*` 不激活
- [x] 打开时贡献随包 skill（`/reload` 后可见），并允许 `/nano-flow` 选择模式
- [x] 不引入 Agent 预设 roster

#### US-002 `/nano-flow` 四选一

作为 pi 使用者，我用与 `/thinking` 相同的选择器决定 Nano Flow 在何时生效。

- [x] 选项：`一直开` / `一直关` / `当前会话开` / `当前会话关`
- [x] `一直*` 写 `nanoFlow.always` 并同步当前会话；`当前会话*` 只写分支 entry；会话覆盖优先
- [x] `--nano-flow` 启动即开；`/nano-flow status` 报告模式与 active Plan 计数

### 上下文

#### US-003 取消压缩 + 就地清空

作为 pi 使用者，Nano Flow 会话不被 pi 自动压缩打断；达到阈值时在同一会话内清空模型上下文并恢复 Plan。

- [x] 模式生效时 `session_before_compact` 取消压缩
- [x] `input` 时按 `getContextUsage()` 判断阈值，追加 `nano-flow-reset` 标记
- [x] `context` 只保留标记之后的消息，并前置"恢复当前 Plan"种子
- [x] 不新建会话、不删除会话文件；关闭模式后恢复 pi 压缩

### 提问

#### US-004 ask_questions

作为 Nano Flow 用户，模型可以一次提出任意数量的问题，每题有选项、自定义回答与跳过。

- [x] 工具随模式激活；非交互模式返回可读错误
- [x] `questions` 数组不限数量；每题 `options` 可空，`allow_custom` / `allow_skip` 默认开
- [x] Esc 取消后续问题，保留已完成答案

### 查询与收口

#### US-005 无面板，命令与工具查询

作为 pi 使用者，我不需要额外面板，用命令和工具就能看到状态与明细。

- [x] `/nano-flow status` 返回模式与 active Plan 的 note 计数
- [x] 明细走 `nano_flow_read` 的 `plans` / `resume` / `ready` 等
- [x] 非 `nano_flow_*` 工具显式访问 `notes.json` 被 `tool_call` 拒绝（策略级）

## 约束与澄清

- 用户明确：不需要预设、不需要面板；轮转是"当前会话清空上下文"，不是新建会话。
- 沿用 DSH 的纯逻辑：`dag` / `plan` / `store` / `check-runner` / `check-domain.mjs` / 工具业务逻辑 / 提示词与 skill 内容。
- 不迁移 DSH 的预设 roster、persona、其它插件行、Web ready 面板、`agentPresets`、`sessionController` 轮转。
- `transcript` 仍保留旧消息：pi 没有删除会话条目的扩展 API，清空只作用于模型上下文。

## 迷雾

无。开关粒度、模式四项、压缩取消、就地清空、`ask_questions` 形态与无面板均由 2026-11-07 用户输入确定。

## 上下文

- [spec](spec.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)
- [ADR-0005](../../../adr/0005-NanoFlow迁移到pi-toolkit.md)
- 来源实现：`packages/dsh-toolkit/src/nano-flow/`
- 目标实现：`packages/pi-toolkit/src/nano-flow/`
