---
name: '001-迁移旧dsh-plans'
description: '把 17 个旧 dsh Plan 的 story/spec/notes.json 转成当前 spec + note 格式。'
status: completed
reason:
related_noted: []
next_step: '等待用户验收；旧 plans 保留在 .tmp'
---

# 001-迁移旧dsh-plans

## 交付

- `.agents/domains/dsh/plans/{active,archived,reference}/` 下 17 个 Plan 的 `spec.md`、`notes_index.md` 与 note 文件。
- 旧 `story.md` 并入 spec；旧 `notes.json` 每条 note 转成一个 markdown 文件。
- 状态映射：`waiting + needs=review` → `blocked` + reason“等待用户验收”，`needs=answer` → “等待用户回答”，`needs=blocked` / `blocked` → “等待阻塞解除”。
- `blocked_by` → `related_noted`；旧的 `blocked_by` 依赖图不再保留。
- 超限的 2 个 note 与 1 个 spec 已截断并留 `.tmp` 指针。

## 验证

`nano_flow_check` 通过；所有 Plan 的索引与 spec 追踪表由脚本生成。旧 plans 仍在 `.tmp/nano-flow-legacy/domains/dsh/plans/`，可回读完整原文。
