---
name: '009-Plan绑定只经bind工具'
description: '会话↔Plan 绑定只由 nano_flow_bind 写入；check 与 plan-log 不自动绑定。轮转是唯一例外，把旧会话自己那条绑定过继给新会话（013）。'
status: accepted
---

# 009-Plan绑定只经bind工具

会话与 Plan 的绑定收口到显式工具 `nano_flow_bind`：同一会话只保留一个绑定，再次调用即切换。`nano_flow_check` 与 plan-log 首个工具调用时的自动绑定都不再写绑定表。

**唯一例外**：轮转把旧会话自己那条绑定过继给新会话（[013](013-轮转把Plan绑定过继给新会话.md)）。这是同一段工作的物理延续，不是启发式猜测；旧会话没有绑定或 Plan 目录已失效时仍要求首轮 `nano_flow_bind`。

## Considered Options

- **只保留显式 bind（选定）**：绑定是用户/模型可解释的动作；看板与日志的归属不会被启发式猜错，也不会出现「只是问个问题就被绑到唯一 active Plan」。
- **保留 check 绑定**：恢复流程少一步，但 `plan` 过滤、唯一 active Plan 与域过滤会互相干扰，且「校验」隐含写状态不直观。
- **保留 plan-log 唯一 active 自动绑定**：首轮就有日志，但纯聊天会话可能被绑到用户没在推进的 Plan。
- **保留轮转继承**：看板在轮转后立即出现，但它是自动写绑定；与「只能通过 bind 绑定」冲突。

## Consequences

- 新会话与新 Plan 都必须先调用 `nano_flow_bind`，否则 Note 看板与 `log.jsonl` 都不出现；轮转有可过继的绑定时例外（2026-11-13 按现行实现补，见 [013](013-轮转把Plan绑定过继给新会话.md)）。
- 恢复流程首步改为 bind，再跑 `nano_flow_check` 校验；check 只写生成物。
- 轮转通过 `adoptBinding` 过继旧会话的绑定（2026-11-13 补，见 013）；没有可过继的绑定时 seed 要求首轮 bind。
- plan-log 在未绑定时只跟踪会话事件、不落盘；绑定后只写当前轮与后续轮次，绑定前已完成的轮次不回填。
- 删除「已绑定则不动」的 `recordBinding` 与 `bindSession`，绑定表只剩覆盖写。
- ADR 008 的继承方案被取代；多 active Plan 工作区的会话仍可各绑各的 Plan，但绑定动作全部显式。

## 相关

- [008-轮转绑定继承旧会话的Plan](008-轮转绑定继承旧会话的Plan.md) — 被本决策取代的轮转继承方案。
- [013-轮转把Plan绑定过继给新会话](013-轮转把Plan绑定过继给新会话.md) — 本决策的唯一例外与理由。
- [014-轮转为何绑定到已归档Plan](../questions/014-轮转为何绑定到已归档Plan.md) — 过继只按目录存在判断时，空壳目录会被继承的实例。
- [003-提供Plan绑定工具](../plans/reference/2026-11-09-nano-flow优化迭代/003-提供Plan绑定工具.md) — bind 工具的实现记录。
- [004-移除全部隐式绑定路径](../plans/reference/2026-11-09-nano-flow优化迭代/004-移除全部隐式绑定路径.md) — 本决策的实现与验证。
