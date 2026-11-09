---
name: "nano-flow绑定机制与GUIDE写入约束"
description: "梳理会话↔Plan 绑定机制，收口为 nano_flow_bind 单一写入口，并约束 GUIDE 正文只由 dream 维护。"
status: in_progress
---

# nano-flow绑定机制与GUIDE写入约束

优化迭代 nano-flow：查清会话与 Plan 的绑定机制，先新增可切换的绑定工具，再把绑定收口为`nano_flow_bind`单一写入口；同时把「GUIDE.md 正文只由 dream 维护」落成约束（保留空模板初始化）。

## 范围

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md)：只读梳理与缺陷清单。
- [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md)：正文写入边界，已完成。
- [003-提供Plan绑定工具](003-提供Plan绑定工具.md)：`nano_flow_bind` 与切换语义，已完成。
- [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md)：check/plan-log/轮转不再写绑定，待验收。
- 剩余缺陷（R3 生命周期迁移后的旧路径、R4 死条目、R6/R7 清理）待另开 note。

## 当前结论

绑定表位于 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，键为会话 id，值为 `{planPath, cwd, boundAt}`。**只有 `nano_flow_bind` 写绑定**：同一会话只保留一个，再次调用即切换。

- `nano_flow_check` 只校验与生成索引，不写绑定；
- plan-log 只读绑定：未绑定时跟踪事件但不落盘，绑定后写当前轮与后续轮次，绑定前完成轮次不回填；
- 轮转不继承绑定，seed 只带轮转前会话绑定的只读线索，首轮先 bind；
- 看板与 `log.jsonl` 都以绑定为前提。

GUIDE 的正文只由 dream 父会话整体重写；日常 Plan 不得修改、移动或删除。`nano_flow_create` 只在文件缺失时创建空模板，不写正文。

ADR：[008-轮转绑定继承旧会话的Plan](../../../adr/008-轮转绑定继承旧会话的Plan.md) 已 superseded，[009-Plan绑定只经bind工具](../../../adr/009-Plan绑定只经bind工具.md) 记录本决策。

## 待确认

- 验收 [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md)。
- 后续是否清理 R3/R4/R6/R7。

## 恢复入口

先调用 `nano_flow_bind` 绑定本 Plan，再读 [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md) 的移除清单与验证；用户确认后再决定是否开清理 note。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md) | 删除 check、plan-log 与轮转的自动绑定，绑定表只剩 nano_flow_bind 一个写入口。 | blocked | 等待用户验收：check、plan-log 与轮转的隐式写绑定已全部移除 | 用户验收后置 completed；剩余 R3 生命周期迁移与 R4 死条目另开 note。 | 001-梳理会话Plan绑定机制, 003-提供Plan绑定工具 |
