---
name: '004-一条note两阶段'
description: '约定一条 note 走两阶段：waiting/answer 定案 → in_progress 实施 → waiting/review 完成，默认不拆两条。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 004-一条note两阶段

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 定案（参考 pi）

- 需要人拍板的 note：先置 `waiting + needs=answer`，用户答完把结论写进「定案」小节，再回 `in_progress` 实施，完成后 `waiting + needs=review` → `completed`。
- 常态路径 `pending → in_progress → waiting/answer → in_progress → waiting/review → completed`；定案与执行默认不拆成两条 note。
- 例外：定案与执行由不同角色承担，或执行要拆成多个可独立验收的能力时才拆。

## 执行检查点（2026-11-08）

- `prompt.md` 的 notes 节新增「一条 note 走完两个阶段」；
- `skills/ask/SKILL.md` 收敛步骤写明：结论写回同一条 note 的「定案」，需要实施时在同一 note 继续；
- 切片规则保留例外，不强制把定案/执行合并到所有场景。

## 待验证

- 重启后新会话按此口径执行（同一 note 内完成定案与实施）。

## 验收

- prompt 与 ask skill 口径一致；Plan 切片规则能解释「何时仍拆两条」。

## 迁移前的证据
- prompt.md notes 节新增「一条 note 走完两个阶段」：waiting/answer 定案 → in_progress 实施 → waiting/review 完成，默认不拆两条
- skills/ask/SKILL.md 收敛步骤写明结论写回同一条 note 的「定案」并在同一 note 继续实施
- 250 项测试、vp check、build 通过；提交 4e9f3cf3
