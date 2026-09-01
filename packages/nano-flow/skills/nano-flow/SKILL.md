---
name: nano-flow
description: 路由从想法到交付的 Loop Kit 主流程；当任务需要形成用户故事、打磨领域设计、按需拆分 issues、恢复既有 Flow 或判断下一步 skill 时使用。
---

# Nano Flow

`/nano-flow` 只负责选择主流程的起点和传递 Flow context。每个 skill 的步骤、产物与完成标准由该 skill 单独拥有。

## 选择入口

先从用户输入和现场材料判断当前位置，只推荐一条入口：

| 现场                                         | 入口                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------- |
| 角色、收益或可验收的用户结果尚未明确         | [`/to-story`](references/skills/to-story/SKILL.md)                   |
| 用户结果已明确，需要从领域设计开始继续主流程 | [`/quest-with-domain`](references/skills/quest-with-domain/SKILL.md) |

已有 Flow 或 Plan 时不创建新路径；读取 [`FLOW.md`](references/FLOW.md)，从运行态返回的当前位置恢复。

向用户说明推荐入口及区分它与相邻入口的关键事实，并等待明确确认。证据不足时只澄清会改变入口选择的决策。入口唯一且用户已确认时，本步骤完成。

## 进入 Flow

确认新入口后，完整读取 [`FLOW.md`](references/FLOW.md)，以 `/nano-flow` 为发起者执行 `enter-plan`。保存返回的 flow context，只调用返回的 `next_skill`；返回 `message` 时，将它原样携带给该 skill。

`enter-plan` 成功、返回入口与确认结果一致、完整 context 已传给该入口且没有重复进入 Flow 时，本步骤完成。

## 沿运行态推进

每次只完整读取并执行当前返回的 skill，并将同次返回的 `message` 原样携带给它。当前 skill 的完成标准成立后，按 [`FLOW.md`](references/FLOW.md) 登记真实证据，再执行新的 `next_skill` 或 `next_action`。工作区领域文档的定位、布局与生命周期以 [`DOMAIN.md`](references/DOMAIN.md) 为单一事实源，并只在当前 skill 需要时读取。

运行态到达终点，或形成带恢复条件的 blocked 结果时，本次路由完成。
