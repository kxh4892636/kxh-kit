---
name: '013-旧Plan转notes.jsonDAG'
description: '把 28 个旧 Plan、97 条 Markdown note 转成 notes.json DAG：拆超限、补 story、抽 evidence，逐 Plan 校验。'
status: completed
reason: ''
related_noted:
  - '002-迁移docs全部域到.agents-domains'
next_step: ''
---

# 013-旧Plan转notes.jsonDAG

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 范围

`.agents/domains/<domain>/plans/<lifecycle>/` 下 28 个旧 Plan、97 条 `NN-标题.md`。

## 转换规则

1. `NN-标题.md` → note：id 按顺序两位编号；title 取文件名去前缀；description 取正文首个段落，压到 144 字内；content 原样（去掉 frontmatter）。
2. status / blocked_by 取 frontmatter；没有 frontmatter 的按 completed、无依赖。
3. evidence 从「验证 / 验收 / 检查 / 测试」段落抽取；没有的写「原 Plan 无独立验证记录（历史迁移）」。
4. 超限正文按行切块（≤ 13,312 B），标题加（i/n）；spec 超 34,816 B 的拆成 `spec.md` + `spec-NN-分册.md`，主文件留分册链接。
5. 缺 `story.md` 的从 spec 的「问题 / 背景 / 目标」提炼，首行标注「由 spec 迁移生成」。
6. `index` 置空；无编号 note 的 Plan（无限故事）`notes` 为空数组。

## 执行检查点(2026-11-07)

- 脚本：`scripts/migrate-legacy-plans.mjs`（主转换，可复跑、幂等）+ `scripts/rewrite-notes-links.mjs`（把指向已并入 notes.json 的 `NN-*.md` 链接改写为 `note NN「标题」`）+ `scripts/fix-note-descriptions.mjs`（压回 144 字）。
- 结果：28 个 Plan → 101 条 note（97 条原文 + 4 条超限拆分：etf 合并为单一应用 2、dsh-alive 全平台 1、dsh 插件装进 desktop 宿主 1）；无限故事 spec 拆 1 册；14 个 Plan 补 story。
- 目录名修正：`2026-10-31-dsh-infinite-story` → `2026-10-31-无限故事插件`（原目录名不含中文，违反 Plan 命名）。
- 链接：迁移引入的 note 文件链接全部改写；剩余断链是历史遗留（`.flow/quest/*`、`../../CONTEXT.md`、`packages/*` 等深度或目标本身不存在）。
- 校验口径：`check-domain` 对 `reference` / `archived` 冻结 Plan 跳过 Markdown 链接校验（与「冻结内容不校验模板差异」一致），active 仍校验。改动与测试见执行记录。

## 验收

- 28 个 Plan 均有 `notes.json`；`nano_flow_check plan` 逐个通过。
- note 总数与原文一致（含拆分计数），逐 Plan 清单见执行检查点。
- notes.json 里不出现编造的事实：evidence 缺失的按第 3 条如实标注。

## 迁移前的证据
- scripts/migrate-legacy-plans.mjs：28 个旧 Plan → 101 条 note（97 原文 + 4 条超限拆分：etf 2、dsh-alive 全平台 1、dsh 装进 desktop 1）；无限故事 spec 拆 spec-01-分册；14 个 Plan 补 story（标注由 spec 迁移生成）
- scripts/rewrite-notes-links.mjs：指向已并入 notes.json 的 NN-*.md 链接改写为 note NN「标题」；scripts/fix-note-descriptions.mjs：1 条 description 压回 144 字
- 内容守恒：原 97 个 note 文件 485,855 B → note 正文 480,837 B（差 5,018 B = 剥离 frontmatter + 链接改写）
- 目录名修正：2026-10-31-dsh-infinite-story → 2026-10-31-无限故事插件（原目录名不含中文）
- check-domain 冻结 Plan 跳过 Markdown 链接（active 仍校验）；新增 runtime.test 用例覆盖 active 报错 / reference 不报错
- 29 个 Plan（28 迁移 + active 本 Plan）逐个 nano_flow_check plan：ALL PASS
- 门禁：vp check 通过（101 文件格式、85 文件无告警）；249 测试通过；build 成功
