---
name: loop-x
description: 路由从想法到交付的 Loop Kit 路径；当任务需要打磨短程领域设计、形成用户故事、为长任务建立可恢复 Plan、恢复既有 Plan 或判断下一步 skill 时使用。
---

# LoopX

`/loop-x` 只负责选择路径和传递 Flow context。Flow 的步骤、产物与完成标准由对应 skill 控制。

## 选择入口

读取 [`DOMAIN.md`](references/DOMAIN.md)，了解工作区领域文档的定位、布局与生命周期；
完整读取 [`workflows/README.md`](references/workflows/README.md)。它是可复用工作流的触发索引；

先从用户输入、工作区环境和上下文定位业务域，根据工作内容推荐一条入口：

| 现场                                                                     | 入口                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 角色、收益或可验收的用户结果尚未明确，打磨模糊想法至清晰目标             | [`/to-story`](references/subskills/to-story/SKILL.md)               |
| 已有目标足以进入领域设计，或只需要澄清领域语言、方案边界、关键 trade-off | [`/grill-with-docs`](references/subskills/grill-with-docs/SKILL.md) |

已有 Flow 或 Plan 时不创建新路径；读取 [`FLOW.md`](references/FLOW.md)，从运行态返回的当前位置恢复。

向用户说明推荐入口及区分它与相邻入口的关键事实，并等待明确确认。证据不足时只澄清会改变入口选择的决策。入口唯一且用户已确认时，本步骤完成。

## 进入 Flow

确认新入口后，完整读取 `FLOW.md`，以 `/loop-x` 为发起者执行 `enter-plan`。保存返回的 flow context，只调用返回的 `next_skill`。

`enter-plan` 成功、返回入口与确认结果一致、完整 context 已传给该入口且没有重复进入 Flow 时，本步骤完成。

## 沿运行态推进

每次只完整读取并执行当前返回的 skill。当前 skill 的完成标准成立后，按 `FLOW.md` 登记真实证据，再执行新的 `next_skill` 或 `next_action`。

`/grill-with-docs` 之后自动判断是否执行 `/to-issues`：单上下文、单会话可完成的短程任务登记 `/to-issues=skipped`；需要跨会话、长程推进或多个纵切 issue 的长程任务执行 `/to-issues` 并登记 `completed`。

运行态到达终点，或形成带恢复条件的 blocked 结果时，本次路由完成。
