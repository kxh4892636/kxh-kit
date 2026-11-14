---
name: '002-归档Plan的模板缺项不再报错'
description: 'reference/archived 是冻结内容，check 只校验未归档 Plan。'
---

# 002-归档Plan的模板缺项不再报错

## 适用条件与现象

Plan 迁入 `reference` 或 `archived` 后，`node <nano-flow-skill-root>/scripts/check-domain.mjs .` 不再报告其缺少「执行检查点」「决策与证据」或 story.md。

## 原因

`reference` 与 `archived` 是冻结内容，模板随 skill 演进；只校验仍在推进的 `planning` 与 `implementing`，避免历史缺项淹没本次新增问题。

## 解决方法

Plan 在迁入冻结生命周期前完成模板校验；归档后不补写历史文档，恢复工作时先迁回 `planning` 或 `implementing`。

## 验证

校验输出只包含 `planning` 与 `implementing` 下的 Plan。

## 来源

[domain/PLAN.md](../../../../repos/nano-flow/skills/nano-flow/references/skills/domain/PLAN.md)
