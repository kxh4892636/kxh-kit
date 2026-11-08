---
name: "007-会话内未完成note面板"
description: "在输入框 dock 展示当前会话绑定 Plan 的未完成 note，样式与 TODO 面板一致。"
status: blocked
reason: "0.5.21 已把行内状态改成中文名并去掉图标；等待用户确认文本版面板的最终观感"
related_noted:
  - '006-固定提示词改名为system'
  - '008-修复notes事件导致会话历史加载失败'
next_step: '重启后确认面板已显示「阻塞 + note 名称」，确认后置 completed'
---

# 007-会话内未完成note面板

## 取证（工作区事实）

- TODO 面板：`dsh-client-ui-conversation/lib/client.js:16590` 注册 `conversation.input.dock`（`id: "todo"`, `order: 0`），`TodoDock` 用 `useProjection("todos")`；面板结构见 `:16528` `TodoPanel`，样式见 `:16404`（只用 `--dsw-*` token）。
- 插槽契约：`dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:187`——`conversation.input.dock` 是 `kind: list, scope: session`，「full-width entries above the composer card」。
- 插件先例：`dsh-client-ui-goal/lib/client.js:549` 用同一 API 注册自己的 dock 条目；本插件客户端半已用 `sidebar.panellist` / `main` / `conversation.input.right`（`src/client/index.ts:31`）。
- 投影机制：`dsh-session-projection/README.zh.md:34` 起的 `register(definition)` 支持 `wire` 客户端可见单元，todo 的 `todos` 单元见 `dsh-tool-todo/lib/index.js:81`；客户端 `useProjection(<key>)` 取最近事件快照，重开会话可回放。
- tooltip：宿主基座有 `Tooltip`（`src/client/primitives.d.ts:58`，`label` + `side` + `portal`）；它是自定义组件（克隆子元素挂 hover），不是原生 `title`。
- 预设无 todo：本会话（nano-flow 预设）工具列表里没有 `todo_write`，预设只挂本插件入口（`nano-flow/preset.ts:87`），所以 dock 里不存在 Todo 面板，无需避让。
- 位置与顺序（子代理核实）：Todo 面板在 `ConversationContent.composerStack` 顶部（composer 卡片正上方、sticky 底部），dock 条目按 order 升序——todo 0、goal 10、queue 20。
- 状态行只有图标没有文字：`li[data-status]` + 圆环 glyph；中文计数文案 `{done} 已完成 / {active} 进行中 / {pending} 待处理`，中文标题为「任务」（locale 命名空间 `conversation`）。
- 投影是宿主独有：客户端只能 `useProjection(key)` 读，不能注册；key 由宿主 `ctx.sessionProjections.register` 注册并合并 `SessionProjectionMap` 类型表。`useProjection` 是 session 插槽的标准 prop（`dsh-client-ui-renderer/lib/client.js:538` 注入）。

## 决策（第 1 轮确认）

- 绑定：会话首次解析到**唯一** active Plan 时绑定并写进会话日志，之后固定；多个 active Plan 时不显示，等用户指定。
- 刷新：固定间隔轮询（5s）。
- 行内容：复用 TODO 的圆环状态图标 + note 名称，hover 用 Tooltip 显示 `description`。
- 可见性：只在 nano-flow 预设的会话出现（nano-flow 里没有 todo，dock 独占）。

## 未决假设（实施按此执行，发现不成立先报告）

- **A1** 面板头部照搬 TODO 的结构：清单图标 + 标题「Note」+ 计数（如「2 进行中 · 1 阻塞 · 3 待处理」，零值段省略）+ chevron 折叠按钮；但**默认展开**（Todo 默认折叠，本面板的存在意义就是展示未完成 note），组件重挂载回到展开态。
- **A2** `blocked` 没有对应图标：用 `pending` 的虚线环 + `--dsw-alias-state-error-primary` 颜色。
- **A3** 无绑定 Plan 或没有未完成 note 时不渲染（与 TODO 空态一致）。
- **A4** 「轮询」落在宿主侧：每 5s 重算快照，**只有快照变化才** append 会话事件，客户端仍走会话投影推送（UI 即时、日志不膨胀）。纯客户端 5s 拉 HTTP 会多一个路由且必然滞后。定时器按会话（agent）登记，随挂载销毁。
- **A5** 绑定后 Plan 被移到 `reference/` / `archived/`：面板消失（不追新路径）。
- **A6** 绑定从会话日志回放，重启宿主后仍在；同一 workspace 里换 Plan 需要新会话。
- **A7** dock `order: 5`（todo 0 / goal 10 之间；nano-flow 会话里没有 todo，视觉位置相同）。

## 设计

**宿主半**（nano-flow 预设作用域）

- 新增投影单元 `nanoFlowNotes`：wire 状态 `{ planName, planPath, notes: [{ name, status, description }] } | null`，`notes` 只含 `pending` / `in_progress` / `blocked`。
- 新增会话事件 `nano-flow/notes`（`SessionEventMap` 增补）：携带同一快照；投影取最近一条。
- 触发：首轮 `agent/pre-step` 解析绑定；`nano_flow_create` / `nano_flow_check` 返回后重算；宿主 5s 定时器重算（有变化才 append）。
- 解析规则：`<cwd>/.agents/domains/*/plans/active/` 恰好一个 Plan 时绑定；解析结果缓存于会话（以投影最近值为准，避免每次读盘判断）。

**客户端半**

- `client/index.ts` 注册 `conversation.input.dock` 条目：`id: "nano-flow-notes"`, `order: 0`。
- `NotesDock({ useProjection })`：`agentPreset` 投影 ≠ `nano-flow` 时返回 `null`；`nanoFlowNotes` 为 `null` 或 `notes` 为空时返回 `null`；其余渲染照 `TodoPanel` 结构（root / body / header / lead / title / progress / chevron / list / item / glyph / content）。
- 每行：`Tooltip(label=description)` 包住「圆环图标 + `name`」。
- 类型：宿主半合并 `SessionProjectionMap` / `SessionProjectionStateMap`；客户端半在自己的 d.ts 里声明 `nanoFlowNotes` 键（客户端编译期看不到宿主类型表）。
- 样式：新增独立 module css（与 `stylesheet.ts` 同法注入 `data-plugin-css`），度量与 token 照抄 `TodoPanel.module.css`；图标用同 path 的内联 SVG（conversation 包未导出 glyph）。
- 空态与预设门禁如上。

## 验收

- 选中 nano-flow 预设的会话：输入框上方出现与 TODO 同款面板，列出该 Plan 未完成 note（图标 + 名称）；hover 显示 description；计数与折叠可用。
- 改一条 note 状态后 ≤5s 面板更新；重开会话仍有数据。
- 非 nano-flow 会话、无绑定 Plan、全部完成三种情况都不渲染。
- 构建、237 项测试、`vp check` 通过；安装 0.5.1x 后真机按 README 验证。

## 第 1 轮拷问

#### Q1 — 会话与 Plan 怎么绑定

- 问题：会话日志、`nano-flow-mount.json`、toolkit 存储都没有 plan 字段，绑定来源需要新定。
- 前置问题：无。
- 下游边界：决定宿主是否需要写自定义会话事件、以及 Plan 迁移后面板如何表现。
- 推荐答案及理由：首次解析即绑定并写进会话日志——可回放、可跨重启，符合「一个 session 一个 plan」。
- 修改意见：用户选择该选项。
- 处理结论：已确认；见「决策」与「设计」。

#### Q2 — 面板数据什么时候刷新

- 问题：模型常用 edit 工具直接改 note 状态，工具调用后刷新会漏。
- 前置问题：Q1。
- 下游边界：决定是否需要宿主定时器与 HTTP 路由。
- 推荐答案及理由：每轮开始重算 + 工具调用后立即（变化才写事件）。
- 修改意见：用户选择「固定间隔轮询（如 5s）」。
- 处理结论：已确认轮询语义；实现细节记为假设 A4（宿主侧 5s 轮询 + 变化才写事件 + 投影推送）。

#### Q3 — 未完成 note 每一行怎么呈现

- 问题：文字状态 + 名称 / Todo 图标 + 名称 / 两者都显示。
- 前置问题：无。
- 下游边界：决定是否需要照抄 Todo 的三个状态 glyph。
- 推荐答案及理由：文字状态 + 名称，贴合用户原话。
- 修改意见：用户选择「复用 Todo 的圆环状态图标 + note 名称，hover 显示概述」。
- 处理结论：已确认；补 A2（blocked 无对应图标）。

#### Q4 — 面板放在哪、何时显示

- 问题：dock 内与 Todo 的相对位置、空态与预设门禁。
- 前置问题：无。
- 下游边界：决定 slot 注册的 `order` 与组件的门禁条件。
- 推荐答案及理由：同 dock、排在 Todo 之后（order 1），空态不渲染，仅预设会话。
- 修改意见：用户答「只有 nano-flow 面板才展示, nano-flow 不存在 todo」——即本面板独占 dock。
- 处理结论：已确认；`order: 0`，门禁用 `agentPreset` 投影；空态按 A3。

### 补充说明

- 用户原话「一个 session 对应一个 plan，每个 session 只显示对应 plan 的 note」已落为绑定规则与门禁；同一 workspace 内多 Plan 并存时以「唯一 active Plan」为绑定条件。
- `prompts/agents.md` → `system.md` 与面板无关，单独落在 note 006。

## 实施记录

- 宿主：`src/nano-flow/notes.ts`（frontmatter 解析、未完成 note 过滤、唯一 active Plan 绑定、快照组装）；`src/nano-flow/notes-panel.ts`（投影 `nanoFlowNotes`、事件 `nano-flow/notes`、5s 轮询、按 agent 去重、首次无内容不写事件）。
- 挂载：`plugin.ts` 里 `host.inject(["sessionProjections"])` 注册投影，`agent/pre-step` 触发 attach + refresh，disposer 里 `notes.dispose()`。
- 客户端：`src/client/notes-dock.ts`（dock `id: "nano-flow-notes"`, `order: 5`；`agentPreset !== "nano-flow"` 或快照为空时不渲染；默认展开可折叠；计数按 进行中/阻塞/待处理）；`stylesheet.ts` 新增 `.dshtk-notes*`（度量照 Todo 面板）；`primitives.d.ts` 增 3 个图标声明，测试替身同步。
- 依赖：新增 `zod`（`catalog:`），投影的 `stateSchema` / `viewSchema` 用它。
- 与假设的差异：无。A1–A7 均按设计实现。

## 验证证据

- 测试 255 项通过（34 文件），其中 `notes.test.ts` 10 例覆盖解析、绑定、去重、轮询、首空不写、dispose；`notes-dock.test.ts` 6 例覆盖门禁、计数、tooltip、折叠。
- `vp check`：118 文件格式 + 89 文件 lint/类型全过。
- 构建：`dist/index.mjs` 118.45 kB（含 4 处 `nano-flow/notes`、1 处 `nanoFlowNotes`）；`dist/client.js` 48.34 kB（含 30 处 `dshtk-notes`、2 处 `nano-flow-notes`）。
- 安装 0.5.13 到 desktop profile，安装包与本地构建 SHA256 一致；`zod` 可在 profile 解析。
- **未验证（需重启宿主）**：真实会话里面板出现、5s 内刷新、tooltip 与折叠的真机表现；投影注册是否在预设作用域可见。

## 验收阻塞（2026-11-08）

- 重启/重开后打开 `session-80f0ac73` 历史报 `nano-flow/notes` (seq 1362) unknown 且未标 ignorable，整个会话拒绝加载；面板验收无法进行。
- 该事件正是本 note 的 5s 轮询在 14:46:30 写入的快照。原因、止血与替代方案见 note 008。
- 008 已把数据源改为「宿主路由现算 + 客户端 5s 轮询」，不再写会话事件；本 note 的验收动作不变。
- 结论：面板数据不能写进会话日志；本 note 在 008 完成并重启前不再重新验收。

## 修复与收尾（0.5.18 → 0.5.21）

- **0.5.18 诊断**：客户端阶段上报 + 宿主探针文件，一次重启定位到 `client:render-error`（React #130 `Element type is invalid … got: undefined`）：插件 bundle 里 `IconChecklistOutline14` / `IconChevron*` / `Tooltip` 实际是 `undefined`，带数据首帧渲染即抛错、被插槽边界吞掉并卸载——这也是"第二次请求后轮询停止"的原因。
- **0.5.19 观测**：错误边界 + 逐次轮询上报 + 首次 `null` 快照的 1s 重试（会话刚打开时宿主还没登记会话）。
- **0.5.20 兜底**：primitives 可渲染才复用（图标/Tooltip），否则内联 SVG 与原生 `title`；面板恢复显示，用户确认出现。
- **0.5.21 按用户要求去掉图标**：行改为「中文状态名 + note 名称」（`阻塞 007-…`），折叠改为「收起 / 展开」文本；删除诊断通道（探针路由、`notes-probe.ts`、客户端上报）。

## 验收现状

- 面板已显示（用户截图确认：标题「Note 2 阻塞」+ 两条 blocked）。
- 待确认：文本版行内状态与折叠文本的最终观感（0.5.21，重启后生效）。
