---
name: "nano-flow绑定机制与GUIDE写入约束"
description: "梳理会话↔Plan 绑定机制及其依赖，并为 GUIDE.md 增加仅 dream 维护的约束。"
status: in_progress
---

# nano-flow绑定机制与GUIDE写入约束

优化迭代 nano-flow 的两个入口问题：先查清会话与 Plan 的绑定机制及依赖，再把「GUIDE.md 只能由 dream 维护」从约定变成可执行约束。

## 范围

- 只读梳理：绑定表、写入时机、消费方与现存缺陷，见 [001-梳理会话Plan绑定机制.md](001-梳理会话Plan绑定机制.md)。
- 已实施、待验收：GUIDE.md 的日常写入约束，见 [002-为GUIDE增加仅dream可写约束.md](002-为GUIDE增加仅dream可写约束.md)。
- 绑定机制是否本轮修改、先修哪些缺陷，待用户选择后建 note。

## 当前结论

绑定表位于 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，键为会话 id，值为 `{planPath, cwd, boundAt}`。写入只有三条路径：`nano_flow_check` 成功后的显式/唯一 active Plan 绑定、plan-log 服务在首个工具调用时的自动绑定、轮转时继承旧会话绑定。写入是每会话一次（已存在即跳过），消费方是 Note 看板、`log.jsonl` 轨迹与轮转 seed。

GUIDE.md 已按严格方案落地：固定提示词新增写入边界，`nano_flow_create` 不再创建 GUIDE，空模板已删除；测试、类型检查与 `nano_flow_check` 均通过。等用户验收后把 002 置 completed。

## 待确认

- 绑定机制：本轮只记录事实，还是同时修确定性缺陷（domain 过滤绑错、生命周期迁移后日志写回旧路径）？

## 恢复入口

先读 [001-梳理会话Plan绑定机制.md](001-梳理会话Plan绑定机制.md) 的事实清单与 [002-为GUIDE增加仅dream可写约束.md](002-为GUIDE增加仅dream可写约束.md) 的验收状态；用户确认绑定范围后再决定是否新建修复 note。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md) | 确定约束落点与强度，修正日常流程与 nano_flow_create 对 GUIDE.md 的写入。 | blocked | 等待用户验收严格方案：已禁止日常写入并移除 nano_flow_create 对 GUIDE 的创建 | 用户验收后置 completed；若改选仅提示词方案，回退 create.ts 与 runtime.test.ts 的改动。 | 001-梳理会话Plan绑定机制 |
