---
name: to-issues
description: 将工作方案落盘为 spec 与 issue，或维护其交付状态时使用；按可独立验收的用户结果拆分贯穿各层的 issue，记录直接依赖，同步生命周期并校验领域文档。
argument-hint: "要持久化什么长任务?"
---

# To Issues

## 建立或维护

1. **定域与取证**：按 `<nano-flow-skill-root-dir>/references/DOMAIN.md` 定位业务域与 Plan 路径，读取 CONTEXT、相关 ADR/Workflow 和已有 story、spec、issue、commit/diff。
2. **就地落盘**：创建/更新 spec 与 issue 时读取 [TEMPLATES.md](TEMPLATES.md)，按下方 tracer-bullet 规则拆分；未明确事实纳入「待定」。
3. **收敛**：处理反馈，直到交付结果、直接依赖与验收条件明确，未决项均有恢复条件，默认用户完成确认。
4. **校验**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`.

## Tracer bullets

- 每个 issue 对应一个完整用户结果或业务能力，贯穿所需的所有层级。
- 直接依赖成立后可独立实现、交付和验收；每条依赖说明原因与消费的产物/契约。
- 降低后续实现难度的 prefactoring 排最前。
- 唯一例外是大范围机械重构：expand → 按影响面分批 migrate（每批一个 issue）→ contract 删除旧形态。

## 生命周期

```text
pending → in_progress → completed
              ↕
           blocked
```

- 开始工作: `status` 更新为 `in_progress`。
- 堵塞卡点: 标记 `blocked`, 并写入障碍与解除条件
- 完成交付: 更新「交付记录」，标记 `completed`。

每次 Issue 状态变化，同步 `spec.md` 的 Issue 表与派生状态：全部 pending 为 pending，全部 completed 为 completed，其余为 in_progress。文档更新后从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`;

plan 标记为 `completed` 后, 询问用户是否迁移到 reference;
