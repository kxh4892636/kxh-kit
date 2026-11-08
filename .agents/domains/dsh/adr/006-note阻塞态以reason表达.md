---
name: '006-note阻塞态以reason表达'
description: 'note 用 blocked + reason 表达等待，放弃 waiting/needs 与 DAG，按状态和 next_step 推进。'
status: accepted
---

# 006-note阻塞态以reason表达

Plan 的 note 只用四个状态：`pending` / `in_progress` / `blocked` / `completed`。`blocked` 表示当下必须等自身之外的东西，`reason` 是字符串，写清在等什么、何时解除；其他状态不写 `reason`。note 之间只用 `related_noted` 表达关联，不再维护 `blocked_by` 依赖图，也不再有 `ready` 拓扑与 `waiting.needs` 分支。

## Considered Options

- **blocked + reason（选定）**：状态 4 个、统一一个阻塞字段；与 markdown 文件、手工编辑和 `nano_flow_check` 的校验面一致。
- **waiting + needs（旧方案）**：用 `answer` / `review` / `blocked` 区分等待目标；消费点多一套分支，且与 `blocked` 语义重叠。
- **保留 DAG**：能自动算可执行队列，但需要工具收口、拓扑校验与并发写入控制；本轮明确放弃。

## Consequences

- spec 的 `## 追踪 Note` 只按状态排序，不再给「可执行/不可执行」分组；由模型看 `status`、`next_step`、`related_noted` 选择下一条。
- `nano_flow_check` 校验 `blocked` 必有 `reason`、其他状态不得写 `reason`，并校验 `related_noted` 引用的 name 存在。
- 旧文档的 `waiting` / `needs` / `blocked_by` 不再兼容；迁移时转成 `blocked + reason` 或删除依赖。
- `related_noted` 不构成 DAG，删除 note 前仍需修正引用它的其他 note。
