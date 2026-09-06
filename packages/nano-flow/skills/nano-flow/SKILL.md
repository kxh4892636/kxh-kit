---
name: nano-flow
description: 进入、恢复或推进从故事与设计、issue 拆分、准入到交付的 Flow，或判断下一步 skill 时使用。
---

# Nano Flow

`/nano-flow` 拥有主流程推进与 Flow context 传递；各 skill 拥有自己的步骤、产物和完成标准。

## 选择模式

已有 Flow 或 Plan 时，读取 [FLOW.md](./FLOW.md)，用 status 查看当前位置并 acquire 恢复。新 Flow 从 `/questing` 进入，按工作性质选择一种模式并说明理由, 等待用户确认：

| 工作性质                       | 模式             |
| ------------------------------ | ---------------- |
| 改动大、需要用户介入与深入交互 | `manual`（默认） |
| 改动小、可自动推进修复或实现   | `auto`           |

复用用户已有授权与模式偏好；只澄清会改变模式或执行范围的未决事项。模式与进入 Flow 的授权明确时完成。

## 进入 Flow

完整读取 [FLOW.md](./FLOW.md)，以稳定的 Plan 标识执行 acquire，传入已确定的 mode；恢复时复用 session。

返回 owned、当前位置与目标一致且完整 context 已传给当前 skill 时完成；issues 状态先按已确认优先级领取 ready Issue。

## 沿运行态推进

只完整读取并执行 next.skill，原样携带同次返回的 next.message。完成条件成立后 report 真实证据，再使用新快照；交付须在提交成功后报告完成。长操作 acquire 续租，暂停或阻塞通过 report 留下可恢复状态。

当前 skill 需要领域文档时，读取 [DOMAIN.md](references/DOMAIN.md)，以其定位、布局和生命周期为权威约束。

目标 completed，或已登记暂停、带解除条件的 blocked 结果并释放租约时，本次路由完成。
