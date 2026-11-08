---
name: "009-Plan轨迹日志"
description: "在每个 Plan 目录追加 log.jsonl，把对应 nano-flow 会话的每轮轨迹（精简）持久化。"
status: in_progress
related_noted:
  - '007-会话内未完成note面板'
  - '008-修复notes事件导致会话历史加载失败'
next_step: '重装 0.5.23 并重启宿主，触发绑定轮，确认记录含完整 user/assistant/tools/usage/seq；再验轮转后新段头'
---

# 009-Plan轨迹日志

## 背景与目标

用户要求：每个 Plan 下有一个 `log.jsonl`，把该 Plan 对应会话的全部历史轨迹保留下来。当前会话的历史只存在于 `$DSH_HOME/sessions` 的 zstd 日志里，且轮转会把它删掉，Plan 目录里没有任何轨迹。

## 决策（已逐项确认）

- **内容形态**：只存 **compact（精简轨迹）**，且入 git；raw 不保留（用户明确否决 raw）。
- **聚合**：每 Plan 一个 `log.jsonl`，多会话分段追加：文件内先写 `session` 段头，之后每轮一条 `turn`。
- **记录粒度**：每轮一条。
- **截断**：工具 `args` / `result` 各截到 4 KB，附 `truncated` 布尔与原始字节数。
- **覆盖范围**：只记 nano-flow 预设会话，不含 subagent 子会话。
- **绑定**：会话首次命中即绑定并持久化 `planPath`。
- **回填**：之后的新会话自动记录；当前会话首次绑定后从持久化日志回填历史轮次。
- **Plan 归位**：作为本 Plan 的 note 009（用户选择，不新建 Plan）。

## 取证

> 版本基线（2026-11-08 更新）：本地 `vite-plus` 工具树已用 npm 升级到 **0.2.2-rc.1**，与运行宿主 `app.asar` 内的 `@deepseek-ai/dsh-session@0.2.2-rc.1` 同版本；后续实现与核对都以该树为准。事件字段已用真实会话日志复核。

- 轮转会**物理删除**旧会话日志：`rotate.ts:172-201` 走 archive → detach → `deleteSessionLogs`（延迟 150 ms），旧日志目录被删；所以「事后导出」必丢历史，必须边发生边落盘。轮转是**新会话新日志**（`sessionController.create()` 铸新 `session-<uuid>`），不是续写。
- 实时通道：`ctx.on('session/event', (session, event) => void, { global: true })`，提交后 fire-and-forget；**构造函数 seed 不触发**，所以恢复会话必须先用快照补齐。
- 受支持的读取面：`ctx.sessionQuery.observeSession(id)` / `readSession(id)` 返回 `{header, events[]}`（数组快照）；`ctx.sessionPersistence.open(id,'read').read(offset, length)` 支持按 seq 增量读。已弃用且禁止新增：`eventAt` / `snapshotEvents` / `ownEvents`。
- 会话定位：`header.cwd` 决定工作区；没有 API 暴露宿主日志路径，也不需要——绑定表只存 `cwd + planPath`。
- 真实事件形状（v4 日志实测）：`user/message` 不带 `turn`（需按 `turn/start`→`turn/end` 的 seq 窗口归属）；`assistant/message` 为 `{turn, step, message.content[{type:text|reasoning|tool-call}], usage{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens,totalTokens}}`；`tool/call {callId,name,arguments}`；`tool/result {message.content[].text, isError, message.source.callId}`；`turn/end {turn, reason}`；`time` 为 epoch ms。
- 规模：单事件均值 2–3 KB；本会话 2.47 MB zstd → 7.84 MB 未压缩（1493 帧）。compact 实测：本会话 19 轮 / 518 次工具 / **945 KB**。
- 既有约束：不能把这类状态写进会话事件（question 009），绑定信息必须存宿主文件。

## 设计

**宿主半**（根插件，复用 nano-flow 作用域）

1. 绑定表：`$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，形状 `{ sessionId: { planPath, cwd, boundAt } }`。
2. 绑定时机：会话首次命中——`nano_flow_*` 工具调用、或 `agent/pre-step` 解析到唯一 active Plan（复用 `notes.ts` 的 `notesForWorkspace` / `resolveBoundPlan`）。
3. 采集：`ctx.on("session/event", handler, { global: true })`，只处理已绑定且为 nano-flow 预设的会话；按 turn 缓冲 `user/message`、`assistant/message`（最终文本 + usage）、`tool/call` 与 `tool/result`（按 callId 配对）。**收到大事件时立刻按 4 KB 截断**再入缓冲，避免整份 tool 结果驻留内存。
4. 落盘：`turn/end` 时把一条 `turn` 记录 append 到 `<workspace>/<planPath>/log.jsonl`；该文件还没有本会话段头时先写 `session` 行。只用 append，不重读整文件。
5. 失败策略：写失败只 warn；绑定指向的 Plan 已不存在（被移走）时跳过，保留绑定。
6. 回填：绑定建立时先 `sessionQuery.readSession(sessionId)` 取快照（同时覆盖 seed 不落 firehose 的问题），按同一聚合逻辑补写绑定前轮次；`(sessionId, turn)` 幂等去重。之后 live 事件从快照的最后 seq+1 续接。

**记录结构**

```json
{"type":"session","v":1,"sessionId":"…","cwd":"…","planPath":"…","boundAt":"…"}
{"type":"turn","v":1,"sessionId":"…","turn":12,"startedAt":"…","endedAt":"…","user":"…","assistant":"…","tools":[{"name":"pwsh","args":"…（≤4KB）","ok":true,"result":"…（≤4KB）","truncated":{"args":false,"result":true},"resultBytes":123456}],"usage":{"input":…,"output":…},"seq":[1340,1390]}
```

## 未决假设（实施按此；不成立先报告）

- **A1** 「是否 nano-flow 预设」用现有日志判定（`agent-preset/selected`，`rotate.ts` 已有 `selectedPreset`），不看 header（header 常为 `standard`）。
- **A2** 一轮内多 step 的 assistant 文本合并为一个字符串，上限 8 KB，超限截断并标记。
- **A3** `usage` 字段名以实际 `assistant/message` 事件为准，按存在的字段写入。
- **A4** 幂等键 `(sessionId, turn)`；重复写时跳过。
- **A5** `log.jsonl` 不自动提交 git，由用户提交；预估 200–500 KB/会话。
- **A6** 排除 subagent：`header.origin === "subagent"` 或 `delegationDepth > 0`。
- **A7** 不额外 flush 宿主日志：轨迹文件由我们自己 append，`turn/end` 一定早于轮转删除；中途崩溃的未完成轮不写（可接受）。
- **A8** 实时事件里的 `tool/result` / `assistant/message` 可能到 MB 级：采集时立即截断到 4 KB（assistant 8 KB）再缓冲，内存只保留摘要。
- **A9** 重启/恢复的会话：seed 事件不会出现在 firehose，绑定建立时先 `readSession` 快照补齐，再从最后 seq+1 续接，避免断档。

## 验收

- nano-flow 会话正常对话若干轮后：`<plan>/log.jsonl` 出现该会话段头 + 每轮一条 `turn`，含 user/assistant/tools/usage/seq。
- 不写会话事件，历史加载不受影响；`nano_flow_check` 通过。
- 轮转后新会话在同一文件追加新段头与记录。
- 含 subagent 的任务不产生子会话记录。
- 回填：已存在绑定的会话，历史轮次补齐且不重复。

## 实施记录（0.5.22）

- `src/nano-flow/plan-log.ts`：compact 记录构建（截断、工具配对、usage、seq 窗口归属）、绑定表读写、`log.jsonl` 追加。
- `src/nano-flow/plan-log-service.ts`：绑定（首次 `nano_flow_*` 工具调用触发；`turn/end` 不建绑定，只续写已绑定会话）、快照回填、`session/event` firehose 增量（`{global:true}`）、按会话串行化写入、`dispose` 关闭读句柄；排除 subagent；多 active Plan 拒绝绑定。
- `src/index.ts`：根插件创建服务，`ctx.inject(["sessionPersistence"])` 接持久化读句柄并订阅 `session/event`。
- 绑定表：`$DSH_HOME/toolkit/nano-flow-plan-bindings.json`；日志：`<cwd>/<planPath>/log.jsonl`。
- 本地 `vite-plus` 工具树已升级到 0.2.2-rc.1（与宿主一致），不再依赖 0.1.6。

## 验证证据

- 测试 **277 项通过**（36 文件），新增 `plan-log.test.ts` 11 例 + `plan-log-service.test.ts` 4 例（绑定、回填、增量、重启不重复、subagent 跳过、多 Plan 拒绝）。
- `vp check`：121 文件格式 + 92 文件 lint/类型全过。
- 真实会话探针（`session-80f0ac73`，3146 条事件）：19 轮全部生成记录、518 次工具调用、compact 总计 **945 KB**（原始 7.84 MB）。
- 构建/安装：0.5.22 已装入 desktop profile，安装包与本地构建 SHA256 一致；插件 peer 解析指向本地 0.2.2 树。
- **未验证（需重启宿主）**：真实运行时绑定触发、`log.jsonl` 落盘、轮转后续写；因为这些依赖宿主 live 事件与持久化句柄。

## 验收记录

live 验收（0.5.22）与绑定轮修复（0.5.23）见 [011-轨迹日志绑定轮修复](011-轨迹日志绑定轮修复.md)。

## 第 1 轮拷问

#### Q1 — log 里保留什么

- 问题：原始事件流 / 精简轨迹 / 两者。
- 前置问题：无。
- 下游边界：决定体积、入库方式与是否需要读取原始日志。
- 推荐答案及理由：两者（raw 本地 + compact 入库）。
- 修改意见：用户要求解释两者差异；解释后选择「只存 compact（入库）」。
- 处理结论：已确认只存 compact；raw 不入库也不保留。

#### Q2 — 多轮转会话怎么组织

- 问题：每 Plan 单文件分段追加 / 每会话单文件 / 含 subagent。
- 前置问题：Q1。
- 下游边界：文件布局与轮转后的续写逻辑。
- 推荐答案及理由：每 Plan 一个 `log.jsonl`，会话段头分段，不含 subagent。
- 修改意见：用户选择该选项。
- 处理结论：已确认。

#### Q3 — 会话↔Plan 绑定

- 问题：首命中绑定 / 动态唯一 active Plan / 显式指定。
- 前置问题：无。
- 下游边界：是否需要宿主绑定文件与回填时机。
- 推荐答案及理由：首命中即绑定并持久化 planPath。
- 修改意见：用户选择该选项。
- 处理结论：已确认；绑定存宿主文件（question 009 禁止写会话事件）。

#### Q4 — 入库与体积

- 问题：compact/raw 是否进 git。
- 前置问题：Q1。
- 下游边界：仓库体积策略。
- 推荐答案及理由：compact 入库、raw 本地忽略。
- 修改意见：用户先要求解释差异，最终选「只存 compact（入库）」；raw 入库问题随之作废（用户对第二问未选）。
- 处理结论：已确认 compact 入库；raw 不存。

#### Q5 — 回填范围

- 问题：只新会话 / 新会话 + 回填当前会话 / 全量回填。
- 前置问题：Q1、Q3。
- 下游边界：是否需要读持久化日志与幂等。
- 推荐答案及理由：只对新会话 + 手工回填当前会话。
- 修改意见：用户选择该选项。
- 处理结论：已确认；回填用 `(sessionId, turn)` 幂等。

#### Q6 — compact 的一行代表什么

- 问题：每轮一条 / 每轮头 + 每工具一行 / 只对话文本。
- 前置问题：Q1。
- 下游边界：记录结构与检索方式。
- 推荐答案及理由：每轮一条。
- 修改意见：用户选择该选项。
- 处理结论：已确认。

#### Q7 — 工具参数与结果截断

- 问题：4 KB / 1 KB / 不截断。
- 前置问题：Q6。
- 下游边界：单条体积与信息损失。
- 推荐答案及理由：各 4 KB 截断并标记。
- 修改意见：用户选择该选项。
- 处理结论：已确认。

#### Q8 — 哪些会话产生 log

- 问题：只 nano-flow 预设 / 所有能绑定的会话。
- 前置问题：Q3。
- 下游边界：采集范围与预设判定。
- 推荐答案及理由：只 nano-flow 预设会话。
- 修改意见：用户选择该选项。
- 处理结论：已确认；判定见 A1。

#### Q9 — Plan 归位

- 问题：先迁旧 Plan 到 reference 再新建 / 追加到当前 Plan / 直接新建。
- 前置问题：无。
- 下游边界：单 active Plan 约束与面板/绑定前提。
- 推荐答案及理由：先迁旧 Plan 到 reference，再新建 Plan。
- 修改意见：用户选择「不建新 Plan，作为 note 009 追加到当前 Plan」。
- 处理结论：已确认；本 Plan 回到 `in_progress`，不新建 Plan。

### 补充说明

- 用户原话「把 plan 对应的 session 的所有历史轨迹全部保留」与「只存 compact」存在张力：compact 会丢流式细节与完整工具输出。按用户最终选择执行，并在验收里明确这一点。
- 「所有历史」覆盖范围最终由 3 个约束收窄：只 nano-flow 预设会话、排除 subagent、只从本次变更起记录（当前会话可回填）。
