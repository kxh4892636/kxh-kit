---
name: '008-轮转只在首次turn-end检查'
description: '轮转阈值未触发：0.618 是 61.8%，且 rotated 标记在压力检查前就写入了。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 008-轮转只在首次turn-end检查

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 结论（旧实现）

- **0.618 是 61.8%，不是 61%**；界面百分比是 `Math.round(used / window * 100)`，显示 61% 时实际是 60.5%–61.49%，低于阈值。
- 旧 `rotate.ts` 在 `turn/end` 事件回调里、检查压力之前就 `rotated.add(session.id)`，会话第一次 completed turn 就被永久标记；之后即使超过阈值也不会再检查。
- 旧实现只在 `turn/end` 且 `reason.kind === "completed"` 时检查；界面用 `projectedTokens ?? pressureTokens`，旧轮转只用 `pressureTokens`，口径不一致。

## 修复(2026-11-07)：改为用户发送消息时判断

1. 不再监听 `turn/end`；改为包装 `sessionController.prompt`：用户 `mode === "queue"` 的消息进入时先读上下文压力。
2. 达到阈值时：创建新会话（同一 cwd / nano-flow preset），把「上一会话已轮转、继续当前 Plan」的种子 + 本次用户内容一起 prompt 给新会话，新 prompt 接受后彻底删除旧会话。
3. 新 prompt 失败时回落到旧会话，原消息不丢。
4. `used = projectedTokens ?? pressureTokens`（本宿主只报 `pressureTokens`）。
5. steer 与其它预设的会话直接放行；判定 Nano Flow 的方式见下面的「回归与修复」（预设行的 `agent.session` 那条路已废弃）。

## 执行检查点(2026-11-07)

- `src/nano-flow/rotate.ts`：`attachRotation` 改为 prompt 包装；新增 `PromptRequestLike`；保留 `retire`。
- `src/nano-flow/plugin.ts`：预设行不再装配轮转（`RotationOptions.session` 的注入方式已被「回归与修复」取代）。
- `src/nano-flow/rotate.test.ts`：8 项——低压力放行、高压力重定向且带种子+用户内容、只重定向一次、其它预设/未知会话/steer 放行、subagent 放行、`selectedPreset` 优先读日志事件、新 prompt 失败回落、dispose 还原。
- 验证: 241 测试通过; `vp check` 通过; build 成功。
- 文档: README 的「上限与轮转」与验证第 6/8 条改成现行口径（宿主半判断、种子 + 本次消息、失败回落旧会话、挂载诊断）。

## 回归与修复（2026-11-07 03:1x）

- 真机现象：重启后用户再发消息仍不轮转；同一时刻固定提示词与 `nano_flow_*` 一起消失（会话日志三条见 evidence）。
- 根因：a6f6b7cc 在 `plugin.ts` 里读 `ctx.agent` 取本会话。cordis 对服务属性做 inject 守卫，直接访问抛 `cannot get property "agent" without inject`，预设行的 apply 整条失效——提示词、工具、skill 与轮转一起没了。
- 第二条事实：预设作用域里 `ctx.get("agent")` 也是 undefined（agent 在 agent 作用域，预设行在 standing mount 作用域），所以「按预设实例所属会话过滤」这条路本身不成立。
- 修复：轮转搬到宿主半（根插件 `ctx.inject(["sessionController"])`）——包装 `sessionController.prompt`，用 `request.sessionId` 解析存活会话，用日志里最后一条 `agent-preset/selected` 判定是否 Nano Flow（不依赖 live header），按会话 id 记账 `rotating` / `rotated`；`tokenMeter` / `workspaceRegistry` / `workingDirectory` 惰性解析。
- 诊断：新增 `src/nano-flow/mount-report.ts`，把 `entry` / `apply` / `ready` / `error` / `rotation` 写进 `$DSH_HOME/toolkit/nano-flow-mount.json` 的 `stages`；挂载失败不再静默。
- 复现手段：`dsh --profile <tmp> --from-default-profile web` 建临时 profile 并装包，用 `session/create` RPC（`agentPreset: nano-flow`）建会话，直接读诊断文件；临时 profile 用完即删。
- 本宿主 `tokenMeter.contextPressure` 只返回 `pressureTokens` 与 `contextWindow`（无 `projectedTokens`），阈值因此按上一轮 provider 上报的 prompt 大小判断，触发点略晚于界面百分比。

## 收尾（2026-11-07）：真机项按作废处理

- 已验证：挂载诊断 `rotation` 四项 true、轮转 8 项单测、241 测试、`vp check`、build、pack 与 desktop profile 重装，以及「重启后不轮转」的回归修复。
- 未执行的真机项：DSH desktop 里一条高上下文 queue 消息的端到端验证（新会话接管并删除旧会话、低阈值留在原会话、失败回落）。
- 作废原因（用户确认）：Nano Flow 已迁到 pi-toolkit，pi 侧改用 `nano-flow-reset` 标记 + `context` 过滤的**就地清空**，不新建也不删除会话；DSH 的「新建会话 + 删除旧会话」轮转不再是现行方案，因此该端到端验证失去对象。承接方见 `pi/reference/2026-11-07-NanoFlow迁移到pi-toolkit`。
- DSH 侧 `packages/dsh-toolkit/src/nano-flow/rotate.ts` 与 README 未改动，保持迁移前状态。

## 验收

- 低于阈值：多次 queue 消息都留在原会话（单测覆盖）。
- 超过阈值：下一次 queue 消息进入新会话（种子 + 用户消息），旧会话删除（单测覆盖；真机项作废，见上）。
- 新 prompt 失败时原会话继续收到消息（单测覆盖）。
- 真机端到端随 pi 迁移作废，结论由用户 2026-11-07 确认，故本 note 按作废结论完成，不作为「已验证」记入。

## 待验证

无。用户 2026-11-07 确认迁移完成、DSH 侧真机轮转作废，直接按作废结论 `complete`。

## 迁移前的证据
- `src/nano-flow/rotate.ts`：`rotated.add` 移到压力检查通过后；`used` 改为 `projectedTokens ?? pressureTokens`
- `src/nano-flow/rotate.test.ts` 3 项通过：首次低压力不轮转、跨阈值只轮转一次、projected 优先、非 completed/subagent/其它 preset 不轮转
- 全套 222 测试通过；`vp check` 通过；`build` 成功
- 会话日志 turn 17（seq 2854 / 2858 / 2859）：system/message 里没有固定提示词，request/header 的 tools 从 26 项掉到 23 项，并有 `tool-removal` 的 nano_flow_* 三条 —— 预设半整条没挂上的实证
- 本地临时 profile 复现：`session/create` 报 `agent-preset/invalid: ... cannot get property "agent" without inject`
- 修复后的 `$DSH_HOME/toolkit/nano-flow-mount.json`：stages = entry（via preset）/ apply / ready（prompt 13,041 B）/ rotation（tokenMeter、sessions、workspaceRegistry、workingDirectory 均 true）
- 241 测试通过（原 237）；`vp check` 通过；`build` 成功；已重装 desktop profile
- 用户 2026-11-07 确认「已经迁移完了, 直接 complete」：DSH 侧真机轮转验证按作废处理
- 承接方 `pi/reference/2026-11-07-NanoFlow迁移到pi-toolkit`；其 spec 已排除「自动轮转（新建/删除会话）」，改为 `nano-flow-reset` 标记 + `context` 过滤的就地清空
- DSH 侧已完成并有据可查：`src/nano-flow/rotate.ts` 改 prompt 包装、轮转 8 项单测、241 测试通过、`vp check`、build、pack、desktop profile 重装
- 挂载诊断 `$DSH_HOME/toolkit/nano-flow-mount.json`：stages 的 rotation 四项（tokenMeter / sessions / workspaceRegistry / workingDirectory）为 true
- 未执行的仅为真机高上下文 queue 消息端到端验证；作废原因与承接关系写入 note 08「收尾」小节
- `nano_flow_check workspace` 通过
