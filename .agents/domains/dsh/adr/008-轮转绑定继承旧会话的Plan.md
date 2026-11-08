---
name: '008-轮转绑定继承旧会话的Plan'
description: '轮转后的自动绑定继承轮转前会话的 Plan，与工作区 active Plan 数量无关；无绑定或目录失效时跳过。'
status: accepted
---

# 008-轮转绑定继承旧会话的Plan

轮转（阈值触发，只能自动）后，新会话的看板绑定不再取「工作区唯一 active Plan」，而是从绑定表里读出被轮转会话的 `planPath`，目录仍存在就绑定给新会话。工作区因此可以同时有多个 active Plan：每个会话记录自己的 Plan，轮转只继承自己那条。

## Considered Options

- **继承旧会话绑定（选定）**：与工作区 Plan 数量无关；新会话上下文与看板延续同一 Plan；旧会话没有绑定就跳过，不猜。
- **唯一 active Plan 启发式（原实现）**：工作区只有一个 active Plan 时有效；多 Plan 时静默不绑，且纯聊天会话可能被绑到用户没在推进的 Plan。
- **不自动绑定**：看板要等模型自己跑 `nano_flow_check`，轮转后首轮看不到未完成 note。
- **新会话按 seed 自行选择**：多一次模型判断，seed 只有只读恢复线索，容易选错。

## Consequences

- 旧会话的绑定表条目不清理；会话被物理删除后成为死条目（可在后续维护中回收）。
- 绑定的 Plan 目录仍存在就绑定（包括 reference / archived）；看板照常显示该 Plan 的未完成 note。
- `nano_flow_check` 工具自身的绑定仍按「显式 `plan` 或唯一 active Plan」——非轮转的恢复流程不受本决策影响。
- 轮转 seed 的恢复入口直接用继承到的 Plan（`<domain>/<lifecycle>/<name>`），校验结论里也写明继承的 planPath；没有绑定时提示先确认 Plan，不再依赖「唯一 active Plan」启发式。

## 相关

- [028-轮转绑定继承旧会话的Plan](../plans/archived/2026-11-08-nano-flow重构与dsh迁移/028-轮转绑定继承旧会话的Plan.md) — 实现与验证记录。
- [007-dream由宿主定时任务投递新会话](007-dream由宿主定时任务投递新会话.md) — 同为宿主侧轮转/调度决策。
