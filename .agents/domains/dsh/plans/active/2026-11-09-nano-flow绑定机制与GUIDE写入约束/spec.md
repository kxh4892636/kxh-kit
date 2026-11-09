---
name: "nano-flow绑定机制与GUIDE写入约束"
description: "梳理会话↔Plan 绑定机制及其依赖，新增绑定工具，并为 GUIDE.md 增加仅 dream 维护正文的约束。"
status: in_progress
---

# nano-flow绑定机制与GUIDE写入约束

优化迭代 nano-flow：查清会话与 Plan 的绑定机制及依赖，新增可切换的绑定工具，并把「GUIDE.md 正文只由 dream 维护」落成约束（保留空模板初始化）。

## 范围

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md)：只读梳理绑定表、写入时机、消费方与缺陷。
- [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md)：正文写入边界，已完成。
- [003-提供Plan绑定工具](003-提供Plan绑定工具.md)：`nano_flow_bind` 绑定/切换，待用户验收。
- 剩余绑定缺陷（check 的 domain 过滤、生命周期迁移后的旧路径、死条目回收）待另开 note。

## 当前结论

绑定表位于 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，键为会话 id，值为 `{planPath, cwd, boundAt}`。写入路径：

1. `nano_flow_bind` 显式覆盖，同一会话只保留一个绑定，再次调用即切换；
2. `nano_flow_check` 在未绑定时按显式 `plan` 或唯一 active Plan 绑定；
3. plan-log 在首个工具调用时按「已有绑定或唯一 active Plan」自动绑定；
4. 轮转时继承旧会话绑定。

消费方是 Note 看板、`log.jsonl` 轨迹与轮转 seed。显式切换后看板立即跟随，后续轮次写入新 Plan 的日志；旧 Plan 保留已写入轮次，不回填、不迁移。

GUIDE 的正文只由 dream 父会话整体重写；日常 Plan 不得修改、移动或删除。`nano_flow_create` 只在文件缺失时创建空模板，不写正文。

## 待确认

- 验收 [003-提供Plan绑定工具](003-提供Plan绑定工具.md)。
- 是否继续修绑定缺陷：R1（check domain 过滤绑错）、R3（生命周期迁移后日志写回旧路径）、R4（死条目回收）。

## 恢复入口

读 [003-提供Plan绑定工具](003-提供Plan绑定工具.md) 的决策与验证，再读 [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md) 的缺陷清单；用户确认后续范围后新建 note。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [003-提供Plan绑定工具](003-提供Plan绑定工具.md) | 新增 nano_flow_bind：同一会话只保留一个绑定，再次调用即切换，并让看板与 log 跟随。 | blocked | 等待用户验收 nano_flow_bind：绑定/切换、看板与 log 跟随已实现并通过测试 | 用户验收后置 completed；未覆盖的 check domain 过滤与生命周期迁移缺陷另开 note。 | 001-梳理会话Plan绑定机制, 002-为GUIDE增加仅dream可写约束 |
