---
name: to-issues
description: 将实现方案垂直切片时使用；按可独立验收的用户结果拆分贯穿各层的工作，明确直接依赖，结果作为 notes 交由 domain 维护。
argument-hint: "要对什么工作进行垂直切片?"
---

# To Issues

## 垂直切片

1. **读取**：通过 `/domain skill` 读取当前 Plan 的 story、spec、notes 与工作区事实，复用已有用户结果、设计和交付进度。
2. **切片**：按下方 tracer-bullet 规则拆分，明确每片的交付结果、直接依赖与验收条件；未决项记录恢复条件。
3. **收敛**：处理反馈并按模式确认切片结果。
4. **写回**：通过 domain 将切片创建或合并到 notes，复用已有稳定 ID 与有效证据，更新 spec 中最有用的 notes 索引。拆分结果没有独立 issue 类型；模板、状态、生命周期和校验均由 domain 负责。

## Tracer bullets

- 每个实现切片对应一个完整用户结果或业务能力，贯穿所需的所有层级。
- 直接依赖成立后可独立实现、交付和验收；每条依赖说明原因与消费的产物/契约。
- 降低后续实现难度的 prefactoring 排最前。
- 唯一例外是大范围机械重构：expand → 按影响面分批 migrate（每批一个 note）→ contract 删除旧形态。

## 模式

- manual(默认): `收敛`步骤用户手动确认;
- auto: 所有操作均 agent 自动执行推进;
