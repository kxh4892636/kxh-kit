---
name: 'nano-flow迁移'
description: '把 dsh-toolkit 的 nano-flow 预设迁到 pi-toolkit：文档工具与校验、提示词与 skill、会话模式与绑定、上下文清空、Note 侧栏与详情卡。'
status: 'in_progress'
---

# nano-flow迁移

## 问题

`dsh-toolkit/src/nano-flow` 是 DSH 的 Agent 预设：固定提示词 + GUIDE 快照 + 篇幅限制、`nano_flow_create` / `bind` / `check`、5 个随包 skill、Note 看板、Plan 绑定与轨迹日志、上下文轮转，以及一套只在该预设会话生效的作用域。pi 没有 Agent 预设选择器、没有可自动新建会话的事件接缝、没有会话删除 API，TUI 也没有浏览器 dock 与 hover。需要按 pi 的接缝逐项适配后迁移。

## 方案

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

## 已排除的备选

- **保留 Agent 预设选择器**：pi 没有该接缝；用 `/toolkit` 开关 + 会话模式条目替代。
- **自动新建会话完成轮转**：`ctx.newSession` 只在命令上下文可用，事件处理器无法自动调用。
- **物理删除旧会话**：pi 会话是只追加文件，`SessionManager` 无删除 API。
- **独立 `nano-flow.json`**：与「pi-toolkit 全部配置一个 JSON」冲突。
- **Note 面板走浏览器 dock / hover**：pi 是 TUI；改为 fullscreen overlay + 点击卡片。
- **迁移 `log.jsonl` / dream**：当前没有消费方；dream 明确暂不迁移。
- **迁移 PTC / subagent / schedule / present**：DSH 宿主插件，pi 没有对应物。

## 约束与澄清

- 2026-11-09（用户）：`/toolkit` 开关控制 nano-flow 工具是否可用；`/nano-flow` 参考 `/thinking` 的 UI 与交互，on/off，并可保存默认。
- 2026-11-09（用户）：不新建会话，在原会话继续；按重置时间过滤历史。
- 2026-11-09（用户）：绑定存会话条目。
- 2026-11-09（用户）：不写 `log.jsonl`；用 pi 会话 JSONL，每轮结束同步一次。
- 2026-11-09（用户）：Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名；点击出卡片（概述 + reason + 下一步）。
- 2026-11-09（用户）：skill 仅在 Nano Flow 会话注入；dream 暂不迁移；提问工具统一 `ask_questions`；subagent 段落改为当前 agent 执行；设置只改 JSON。
- 2026-11-09（用户）：侧栏只做 fullscreen；seed 只包裹上一轮输出，本轮用户输入保留为普通消息。

## 范围

- `packages/pi-toolkit/src/nano-flow/`：提示词、skill、模板、校验脚本、三个工具、模式与绑定、上下文清空、Note 侧栏。
- `src/settings.ts` / `src/panel.ts` / `src/index.ts`：新增 `tools.nanoFlow`、`nanoFlow` 配置节、开关行、命令与接缝。
- 单元测试与真机冒烟；`pi-toolkit.example.json` 与 README。
- 本域文档：CONTEXT 术语、ADR、本 Plan 与 note。

## 非范围

- dream 记忆维护、`log.jsonl`、轮转跟随客户端、PTC / subagent / schedule / present。
- 新会话创建、会话删除、Agent 预设选择器。
- Note 侧栏在 regular 模式的展示。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [001-配置与开关](001-配置与开关.md) | 在 pi-toolkit.json 增加 nanoFlow 配置节与 tools.nanoFlow 开关，提供 /nano-flow 的会话 on/off 与 always 默认值。 | blocked | 等待用户验收 | 在交互式 pi 运行 /toolkit 打开 nano-flow，再运行 /nano-flow 验证开/关与 Ctrl+S 默认 | — |
| [002-提示词与skill注入](002-提示词与skill注入.md) | 在 Nano Flow 会话注入固定提示词、GUIDE 快照、篇幅限制与每轮提醒；随包 skill 按会话通过 resources_discover 注入。 | blocked | 等待用户验收 | 新会话确认 system/user 提示词与 5 个 skill 出现；普通会话确认不可见 | — |
| [003-文档工具与校验](003-文档工具与校验.md) | 迁移 nano_flow_create / bind / check、11 个模板与 check-domain 校验脚本，保留全部校验规则与索引生成。 | blocked | 等待用户验收 | 用 nano_flow_create/check 建一个 Plan 并核对索引与校验输出 | — |
| [004-会话模式与Plan绑定](004-会话模式与Plan绑定.md) | 用会话条目保存 nano-flow-mode 与 nano-flow-binding；/nano-flow 开关与 nano_flow_bind 是唯一写入方。 | blocked | 等待用户验收 | 绑定 Plan 后重启会话，确认侧栏与 seed 仍指向同一 Plan | — |
| [005-上下文清空与恢复seed](005-上下文清空与恢复seed.md) | 达到 rotateAt 时写重置条目，context 按时间过滤历史，并把当前 Plan 与上一轮输出作为 seed 插回；不新建会话。 | blocked | 等待用户验收 | 把 rotateAt 调到 0.0001，连续两轮确认 reset 条目与过滤后的上下文 | — |
| [006-Note侧栏与详情卡](006-Note侧栏与详情卡.md) | fullscreen 右上角 Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名，点击出概述/原因/下一步详情卡。 | blocked | 等待用户验收 | fullscreen 下确认侧栏、点击详情卡、Esc 关闭与 turn_end 刷新 | — |
| [007-测试与验收](007-测试与验收.md) | 补齐配置、模式、绑定、seed、校验、侧栏的单测，并做 pi 真机冒烟与领域文档收口。 | blocked | 等待用户验收 | 按 001-006 的验收步骤走完后，把本组 note 置 completed | — |
