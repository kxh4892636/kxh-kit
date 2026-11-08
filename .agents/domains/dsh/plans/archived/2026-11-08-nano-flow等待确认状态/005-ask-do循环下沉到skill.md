---
name: '005-ask-do循环下沉到skill'
description: '把 ask/do 两循环的完整论述从 prompt 下沉到对应 skill，prompt 只留模式判定与指针。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 005-ask-do循环下沉到skill

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 执行检查点（2026-11-08）

- `prompt.md`：删掉 ask 循环与 do 循环两节（含并行执行、门禁、执行、verifying、review、完成与登记），改为两个指针小节；模式循环加「先读对应 skill 再动手」与 `skills/ask/SKILL.md` / `skills/do/SKILL.md` 指针。全文 212 → 92 行。
- `skills/ask/SKILL.md`：承载 Design tree / frontier / 取证-提问-修订-收敛 / 每轮记录模板与 remind；收敛后在原 note 继续实施。
- `skills/do/SKILL.md`：承载选 note、并行执行、门禁、执行、verifying、review、完成与登记（含 `waiting` 门槛）。
- `runtime.test`：ask skill 断言改为 Design tree + frontier；250 项测试、`vp check`、build 通过。

## 待验证

- 重启后新会话按 prompt 指针加载 skill；`/ask` `/do` 与模型触发都能拿到完整循环规格。

## 验收

- prompt 不再含循环步骤；两个 skill 含完整规格；构建后 `dist/nano-flow/skills` 与源码一致。

## 迁移前的证据
- prompt.md 212 → 92 行：ask / do 两节与并行执行、门禁、执行、verifying、review、完成与登记全部下沉
- skills/ask/SKILL.md 承载 Design tree / frontier / 步骤 / 每轮记录；skills/do/SKILL.md 承载步骤 / 并行执行 / 门禁 / 执行 / verifying / review / 完成与登记
- runtime.test 断言改为 Design tree + frontier；250 项测试、vp check、build 通过；提交 4e9f3cf3
