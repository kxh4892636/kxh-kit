---
name: dev-gate
description: 在进入 /implement 前, 使用 /grilling, /grill-with-docs 或 /to-issues 之后触发, 确认工作环境, 单一交付终点和 /verifying 验收门禁等基线, 进行执行前的准入门禁检查.
---

# Dev Gate

**Gate** 是进入 `/implement` 之前的门禁检查. 本 skill 只交付 `ready` 或 `not ready` 结论; `ready` 之后才开始代码变更.

## 1. 准入门禁

基于上下文及其引用产物, 进行不同路径的准入门禁检查;

- `/grilling`: 决策树 **frontier** 清空;
- `/grill-with-docs`: `/grilling` 基础上, `CONTEXT.md` 和 ADR 维护正确;
- `/to-issues`: `/grill-with-docs` 基础上, spec 和 issues 文件存在, issues 依赖图正确, 下一步均为 `/implement`, 状态均为 `pending`, `/loop-x` 的 `script/check-domain.mjs` 校验通过;

完成标准: 本次只指向一个路径, 路径的准入门禁检查通过.

## 2. 基线门禁

用户依次确认 `工作环境`, `交付终点` 和 `验收门禁` 三项基线信息;

### 工作环境

执行该工作所需的环境信息;

### 交付终点

工作流程的最终节点是什么, 即到那个节点停止工作;

### 验收门禁

`/verifying` 使用的最小门禁集合.

完成标准: 三项基线全部向用户明确, 且用户已经确认信息正确.

## 3. 确认门禁通过

向用户提交一张简短基线卡, 逐项列出: 触发路径 + 工作环境 + 交付终点 + 验收门禁;

用户明确确认且完成标准全部成立, 结论为 `ready`, 随后进入 `/implement`. 用户修正任一项时先更新权威文档并重新提交基线卡; 必要前置缺失或仍有决策未知时结论为 `not ready`, 回到对应门禁.

实现期间若上下文及其引用产物, 工作环境, 交付终点或验收门禁发生实质漂移, 返回本 skill 更新并重新进行门禁检查.
