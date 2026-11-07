# Nano Flow 迁移到 pi-toolkit

DSH 的 `dsh-toolkit` 把 Nano Flow 作为 **Agent 预设**交付：预设 roster 里挂固定提示词、`nano_flow_*` 工具与随包 skill，并靠 `sessionController.prompt` 包装做上下文轮转。pi 没有预设注册表、`newSession` 只在命令上下文可用、也没有删除会话的扩展 API，预设与自动轮转都无法照搬。用户要求把 Nano Flow 迁到 `pi-toolkit`，并给定形态：toolkit 开关 + `/nano-flow` 开/关（`Ctrl+S` 设默认）、不要面板、启动时取消 pi 压缩、达到阈值就地清空上下文并恢复 Plan、随 Nano Flow 启用 `ask_questions`。

## Decision

- **第四个开关**：`tools.nanoFlow` 控制能力是否可用（命令、工具注册、随包 skill、`nanoFlow` 配置节）；默认关。`/toolkit` 面板只增加这一行开关，仍不编辑数值。
- **模式选择**：不开预设。`/nano-flow` 与 `/thinking` 对齐：SelectList 只有 `开` / `关`，当前会话值打勾、默认值描述带 `· default`。Enter 只写当前分支的 `nano-flow-mode` entry；`Ctrl+S`（`app.thinking.save`）同时写 `nanoFlow.always` 并写 entry。生效值 = 开关 ∧（会话覆盖 ?? `always`）。`--nano-flow` flag 让会话启动即开。
- **固定提示词**：`before_agent_start` 里把 `prompt.md` 写入 `systemPromptOptions.sections.nano_flow`，按 section diff 注入；不替换整段 system prompt。
- **工具与 skill**：`nano_flow_read` / `nano_flow_write` / `nano_flow_check` 随包注册为 `defaultActive: false`，模式生效时与 `ask_questions` 一起激活；`resources_discover` 在开关打开时贡献 `skills/`（需 `/reload`）。
- **取消压缩**：模式生效时 `session_before_compact` 返回 `{ cancel: true }`，pi 不再自动压缩。
- **就地清空**：`input` 时读取 `ctx.getContextUsage()`，`tokens / contextWindow ≥ rotateAt` 就追加 `nano-flow-reset` 自定义 entry；`context` 事件只保留时间戳不早于标记的消息，并在最前面插入一段"恢复当前 Plan"的种子。全程不新建会话、不删会话。
- **ask_questions**：新增模型工具，逐题询问；每题支持预设选项、自定义回答与跳过，问题数量不设上限；非交互模式返回可读错误，由提示词降级为纯文本提问。
- **收口**：`tool_call` 拦截非 `nano_flow_*` 工具参数中出现的 `notes.json`；这是策略而非安全边界，与 DSH 口径一致。
- **查询面**：不做 ready 面板。`/nano-flow status` 报告模式与全部 active Plan 的 note 计数；明细走 `nano_flow_read` 的 `plans` / `resume` / `ready`。

## Considered Options

- **保留 DSH 的 Agent 预设**：pi 没有 agentPresets 服务，预设 roster 的 20 个插件行也无法对应；拒绝。
- **开关一开就全局注入提示词**：会污染所有普通编码会话；改为开关控制能力、`/nano-flow` 控制会话模式；拒绝全局注入。
- **自动轮转（新建会话 + 删除旧会话）**：`ctx.newSession` 仅命令上下文可用，且没有删除会话的扩展 API；DSH 的 `sessionController.prompt` 包装在 pi 不存在；拒绝。
- **达到阈值时调用 `ctx.compact()`**：pi 压缩会把摘要留在上下文里，不能做到"所有上下文清空"；用户明确要求清空并恢复 Plan；拒绝。
- **就地面板/ready 折叠面板**：pi widget 只渲染不收键，做成可折叠面板需要额外命令与刷新；用户明确说不需要面板；拒绝。
- **把 `ask_user_question` 改成纯文本提问**：ask 循环需要结构化选项与跳过；新增 `ask_questions` 工具与 Nano Flow 同生命周期；拒绝纯文本。
- **四选一（一直开/一直关/当前会话开/当前会话关）**：选项冗余且与 `/thinking` 的「选择 + 设默认」不一致；改为开/关 + `Ctrl+S`，拒绝四选一。
- **为 Nano Flow 增加多个细粒度开关**：用户要求一个工具一个开关；数值与阈值留在 JSON；拒绝拆开关。

## Consequences

- 第四个开关默认关；未打开时 `/nano-flow` 提示先去 `/toolkit` 打开，`nano_flow_*` 不激活。
- 清空只作用于**模型上下文**：pi 没有删除会话条目的扩展 API，TUI 转录仍保留旧消息；新上下文由种子 + 清空后的消息组成。
- `rotateAt` 触发点基于上一轮 usage，可能略晚于界面占用率；清空后到下一次响应之间不再重复触发（`resetPending`）。
- Nano Flow 生效时用户手动 `/compact` 也会被取消；退出模式后恢复 pi 压缩。
- 随包 skill 在开关打开后的下一次 `/reload` 才可见；`learning` skill 仍依赖本工作区的 `nnf anki`。
- DSH 的 `dsh-toolkit/src/nano-flow` 暂时保留作为参照；两者共享同一份 `check-domain.mjs` 语义，需警惕规则漂移。
