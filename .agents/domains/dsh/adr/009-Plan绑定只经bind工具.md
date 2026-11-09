---
name: '009-Plan绑定只经bind工具'
description: '会话↔Plan 绑定只由 nano_flow_bind 写入；check、plan-log 与轮转都不自动绑定。'
status: accepted
---

# 009-Plan绑定只经bind工具

会话与 Plan 的绑定收口到显式工具 `nano_flow_bind`：同一会话只保留一个绑定，再次调用即切换。`nano_flow_check`、plan-log 首个工具调用时的自动绑定、轮转继承都不再写绑定表。轮转 seed 可以带轮转前会话的旧绑定作为只读线索，但新会话必须自己调用 `nano_flow_bind`。

## Considered Options

- **只保留显式 bind（选定）**：绑定是用户/模型可解释的动作；看板与日志的归属不会被启发式猜错，也不会出现「只是问个问题就被绑到唯一 active Plan」。
- **保留 check 绑定**：恢复流程少一步，但 `plan` 过滤、唯一 active Plan 与域过滤会互相干扰，且「校验」隐含写状态不直观。
- **保留 plan-log 唯一 active 自动绑定**：首轮就有日志，但纯聊天会话可能被绑到用户没在推进的 Plan。
- **保留轮转继承**：看板在轮转后立即出现，但它是自动写绑定；与「只能通过 bind 绑定」冲突。

## Consequences

- 新会话、新 Plan、轮转后的会话都必须先调用 `nano_flow_bind`，否则 Note 看板与 `log.jsonl` 都不出现。
- 恢复流程首步改为 bind，再跑 `nano_flow_check` 校验；check 只写生成物。
- 轮转 seed 写「轮转前会话绑定的 Plan」作为线索，并明确「新会话不会自动绑定」。
- plan-log 在未绑定时只跟踪会话事件、不落盘；绑定后只写当前轮与后续轮次，绑定前已完成的轮次不回填。
- 删除「已绑定则不动」的 `recordBinding` 与 `bindSession`，绑定表只剩覆盖写。
- ADR 008 的继承方案被取代；多 active Plan 工作区的会话仍可各绑各的 Plan，但绑定动作全部显式。

## 相关

- [008-轮转绑定继承旧会话的Plan](008-轮转绑定继承旧会话的Plan.md) — 被本决策取代的轮转继承方案。
- [003-提供Plan绑定工具](../plans/reference/2026-11-09-nano-flow优化迭代/003-提供Plan绑定工具.md) — bind 工具的实现记录。
- [004-移除全部隐式绑定路径](../plans/reference/2026-11-09-nano-flow优化迭代/004-移除全部隐式绑定路径.md) — 本决策的实现与验证。
