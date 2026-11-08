---
name: '002-迁移docs全部域到.agents-domains'
description: '把 docs/ 下 6 个域搬到 .agents/domains 并归位生命周期，更新 CONTEXT-MAP 与 notes-guard 注释。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 002-迁移docs全部域到.agents-domains

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 现状(2026-11-07 取证)

- `docs/` 下 6 个域：common / dsh / etf / music / nano-flow / pi；`.agents/domains/dsh` 目前只有指向 `docs/dsh` 的迁移指针。
- 旧 Plan 28 个、编号 note 97 条，全部 Markdown（无 `notes.json`）；另有 `docs/music/design/shots` 图片资产。
- 生命周期目录：空的 `planning` / `implementing` 需丢弃；`docs/etf/plans/implementing/2026-10-17-合并为单一etf应用` 的 spec 标 `status: completed`；`docs/dsh/plans/2026-10-31-dsh-infinite-story` 无生命周期目录，仅 story / spec。
- `docs/` 外引用：`CONTEXT-MAP.md`、`apps/etf/README.md`、`apps/music/README.md`、`packages/nano-flow/README.md`、`packages/dsh-toolkit/src/host/notes-guard.ts` 注释。
- 硬约束：4 条 note > 13 KB（最大 22,562 B）、1 份 spec 38,608 B、约 8 个 Plan 缺 `story.md`。

## 定案(2026-11-07 第 1 轮拷问)

- Q1 旧 Plan 迁法 → **全部转成 `notes.json` DAG**（用户选择，取代原三选一；转换规则见 note 13）。
- Q4 docs 收尾 → 迁完**删除 `docs/`**，同步改全部引用（收尾见 note 14）。
- Q6 超限 → 拆条 / 拆子文件，全量保留（见 note 13）。
- Q7 缺 story → 从 spec 的「问题 / 目标」提炼，标注「由 spec 迁移生成」。
- Q8 evidence → 抽取「验证 / 验收」段落；缺失写「原 Plan 无独立验证记录（历史迁移）」。

## 本 note 范围

1. 6 个域整体搬迁：CONTEXT / QUESTIONS / adr / workflows / plans / 其它资产（music 的 design/shots）→ `.agents/domains/<domain>/`。
2. 生命周期归位：丢弃空 `planning` / `implementing`；etf 的 implementing Plan → reference；dsh-infinite-story → reference。
3. `CONTEXT-MAP.md` 全部改为 `./.agents/domains/<domain>/CONTEXT.md`；`notes-guard.ts` 注释改指新根。
4. 旧 Plan 的 DAG 转换不在本 note（note 13）；`docs/` 删除与剩余外部引用在 note 14。

## 验收

- `nano_flow_check workspace` 通过（6 域 CONTEXT / QUESTIONS / ADR 齐备、map 索引对齐）。
- `nano_flow_read plans` 能列出 dsh 的 active Plan，`nano_flow_check plan` 通过。
- 迁移前后文件清单一一对应（清单对比，无丢失）。

## 历史

- 原「先不动 02，只处理验证」的决定由本次范围扩大取代；原三选一策略（移动 + stub / 原地保留 / 全量迁移）不再适用。

## 迁移前的证据
- git mv 迁移 6 个域：docs 下 tracked 文件 186 → .agents/domains 189（含 dsh active Plan 3 个文件），184 个 rename + dsh CONTEXT/QUESTIONS 覆盖旧 stub
- 生命周期归位：空的 planning / implementing 目录删除；etf implementing Plan → reference；dsh-infinite-story → reference
- CONTEXT-MAP.md 6 条链接改为 ./.agents/domains/<domain>/CONTEXT.md；notes-guard.ts 注释改指 .agents/domains/dsh/QUESTIONS.md
- nano_flow_check workspace 通过
- docs/ 只剩空目录 docs/dsh，删除与外部引用留给 note 14
