---
name: nano-flow
description: 路由从想法到交付的 Nano Flow 主流程；当任务需要形成用户故事、打磨领域设计、按需拆分 issues、恢复既有 Flow 或判断下一步 skill 时使用。
---

# Nano Flow

`/nano-flow` 负责进入与推进主流程、传递 Flow context。每个 skill 的步骤、产物与完成标准由该 skill 单独拥有。

## 选择模式

新 Flow 从 [`/questing`](references/skills/questing/SKILL.md) 进入。按工作性质只推荐一种推进模式：

| 工作性质                       | 模式             |
| ------------------------------ | ---------------- |
| 改动大、需要用户介入与深入交互 | `manual`（默认） |
| 改动小、可自动推进修复或实现   | `auto`           |

已有 Flow 或 Plan 时不创建新路径；读取 [`FLOW.md`](FLOW.md)，从运行态返回的当前位置恢复。

说明推荐模式及理由，证据不足时只澄清会改变模式选择的决策。用户确认模式并同意进入 Flow 时，本步骤完成。

## 进入 Flow

确认新入口后，完整读取 [`FLOW.md`](FLOW.md)，以 `/nano-flow` 为发起者执行 `enter-plan`，并以 `--entry` 和 `--mode` 传入 `/questing` 和已确认的模式。保存返回的 flow context，只调用返回的 `next_skill`；返回 `message` 时，将它原样携带给该 skill。

`enter-plan` 成功、返回入口与确认结果一致、完整 context 已传给该入口且没有重复进入 Flow 时，本步骤完成。

## 沿运行态推进

每次只完整读取并执行当前返回的 skill，并将同次返回的 `message` 原样携带给它。当前 skill 的完成标准成立后，按 [`FLOW.md`](FLOW.md) 登记真实证据，再执行新的 `next_skill` 或 `next_action`。工作区领域文档的定位、布局与生命周期以 [`DOMAIN.md`](references/DOMAIN.md) 为单一事实源，并只在当前 skill 需要时读取。

运行态到达终点，或形成带恢复条件的 blocked 结果时，本次路由完成。
