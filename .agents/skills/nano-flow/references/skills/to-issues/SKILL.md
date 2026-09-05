---
name: to-issues
description: 跨会话推进或需要持久化检查点时，建立和维护可恢复的 spec、设计 frontier 与 tracer-bullet issue 图。
argument-hint: "要持久化什么长任务?"
---

# To Issues

完整读取 DOMAIN.md（`<nano-flow-skill-root-dir>/references/DOMAIN.md`），遵循领域布局与 Plan 生命周期。

## 判断是否跳过

需持久化推进则推荐继续，否则推荐跳过，等待用户确认；

## 建立或维护

写入前完整读取 [TEMPLATE.md](TEMPLATE.md)，以其模板与扩展规则为权威。

1. **定域与取证**：从 map 定位一个 owner 域，读取 CONTEXT、相关 ADR/Workflow 和已有 story、spec、issue、commit/diff。跨域时先确认关系并选主域，或分域拆分；归属和相关事实查明时完成。
2. **就地落盘**：将已确认结论写入 spec 与 issue，按下方 tracer-bullet 规则拆分。新事实更新 spec，新工作新增 issue；尚不能精确表述的 frontier 留在「待定」，执行中 issue 的边界保持稳定。结论均有权威归属时完成。
3. **确认**：按反馈迭代，用户确认边界与依赖图正确时完成。
4. **校验交接**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`，通过下方完成门槛后交接。

## Tracer bullets

- 每个 issue 对应一个完整用户结果或业务能力，只贯穿所需层级。
- 直接依赖成立后可独立实现、交付和验收；每条依赖说明原因与消费的产物/契约。
- 最小验收信号是一个可独立判定的结果。
- 降低后续实现难度的 prefactoring 排最前。
- 唯一例外是大范围机械重构：expand → 按影响面分批 migrate（每批一个 issue）→ contract 删除旧形态。

**完成门槛**：范围无遗漏、每项交付责任唯一归属、依赖图有根且无环、用户确认、校验通过。新建 issue 均为 `pending`，维护时保留既有执行状态；仅凭领域文档、Plan 与 Flow 运行态即可恢复。
