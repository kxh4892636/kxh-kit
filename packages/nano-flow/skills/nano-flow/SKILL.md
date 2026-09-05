---
name: nano-flow
description: 进入、恢复或推进从故事与设计、issue 拆分到交付的 Flow，或判断下一步 skill 时使用。
---

# Nano Flow

`/nano-flow` 拥有主流程推进与 Flow context 传递；各 skill 拥有自己的步骤、产物和完成标准。

## 选择模式

已有 Flow 或 Plan 时，读取 [FLOW.md](FLOW.md)，从运行态当前位置恢复。新 Flow 从 `/questing` 进入，按工作性质只推荐一种模式并说明理由：

| 工作性质                       | 模式             |
| ------------------------------ | ---------------- |
| 改动大、需要用户介入与深入交互 | `manual`（默认） |
| 改动小、可自动推进修复或实现   | `auto`           |

证据不足时，只澄清会改变模式选择的决策。用户确认模式并同意进入 Flow 时完成。

## 进入 Flow

完整读取 [FLOW.md](FLOW.md)，以 `/nano-flow` 为发起者执行一次 `enter-plan`，传入 `--entry /questing` 与已确认的 `--mode`。

命令成功、返回入口符合确认结果、完整 context 已传给入口且未重复进入时完成。

## 沿运行态推进

按 [FLOW.md](FLOW.md) 只完整读取并执行当前返回的 skill，原样携带同次返回的 `message`。完成条件成立后登记真实证据，再执行新返回的 `next_skill` 或 `next_action`。

当前 skill 需要领域文档时，读取 [DOMAIN.md](references/DOMAIN.md)，以其定位、布局和生命周期为权威约束。

运行态到达终点，或形成带恢复条件的 `blocked` 结果时，本次路由完成。
