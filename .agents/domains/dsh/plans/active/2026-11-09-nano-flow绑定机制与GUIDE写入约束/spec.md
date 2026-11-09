---
name: "nano-flow绑定机制与GUIDE写入约束"
description: "梳理会话↔Plan 绑定机制，收口为 nano_flow_bind 单一写入口，并约束 GUIDE 正文只由 dream 维护。"
status: completed
---

# nano-flow绑定机制与GUIDE写入约束

优化迭代 nano-flow：查清会话与 Plan 的绑定机制，先新增可切换的绑定工具，再把绑定收口为`nano_flow_bind`单一写入口；同时把「GUIDE.md 正文只由 dream 维护」落成约束（保留空模板初始化）。

## 范围

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md)：只读梳理与缺陷清单。
- [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md)：正文写入边界，已完成。
- [003-提供Plan绑定工具](003-提供Plan绑定工具.md)：`nano_flow_bind` 与切换语义，已完成。
- [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md)：check/plan-log/轮转不再写绑定，**2026-11-09 真机验收通过**。
- [005-收敛绑定表生命周期与遗留缺陷](005-收敛绑定表生命周期与遗留缺陷.md)：R3/R4/R6/R7 已修复或删除，已完成。
- [006-清理超长Plan描述](006-清理超长Plan描述.md)：21 条超限 description 已修剪，已完成。

## 当前结论

绑定表位于 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，键为会话 id，值为 `{planPath, cwd, boundAt}`。**只有 `nano_flow_bind` 写绑定**：同一会话只保留一个，再次调用即切换。

- `nano_flow_check` 只校验与生成索引，不写绑定；
- plan-log 只读绑定：未绑定时跟踪事件但不落盘，绑定后写当前轮与后续轮次，绑定前完成轮次不回填；
- 轮转不继承绑定，seed 只带轮转前会话绑定的只读线索，首轮先 bind；
- 看板与 `log.jsonl` 都以绑定为前提。

GUIDE 的正文只由 dream 父会话整体重写；日常 Plan 不得修改、移动或删除。`nano_flow_create` 只在文件缺失时创建空模板，不写正文。

绑定表生命周期：Plan 目录解析统一走 `resolvePlanDirectory`（绝对路径直通，相对路径先试绑定 cwd、失效退回工作区）；目录不在时 plan-log 跳过写入并只 warn 一次，不重建旧路径；`nano_flow_bind` 收尾顺带回收宿主已不存在的会话条目——存活集合取「持久化列表 ∪ 仍存活的会话」，无列表、列表抛错或为空时一律不动表。

ADR：[008-轮转绑定继承旧会话的Plan](../../../adr/008-轮转绑定继承旧会话的Plan.md) 已 superseded，[009-Plan绑定只经bind工具](../../../adr/009-Plan绑定只经bind工具.md) 记录本决策。

## 遗留

- 测试覆盖率：`test:coverage` 分支 79.04%，低于仓库 80% 门槛（改动前 78.74%），主要在 undo/archive 与 `rotate.ts`，需单独一轮补测。
- R4 的回收只在 `nano_flow_bind` 时触发，从不 bind 的 `$DSH_HOME` 不会自发清理死条目。

## 恢复入口

6 条 note 全部 completed，本 Plan 可转 reference。若要继续，先读 [005-收敛绑定表生命周期与遗留缺陷](005-收敛绑定表生命周期与遗留缺陷.md) 的「遗留」与本节。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
