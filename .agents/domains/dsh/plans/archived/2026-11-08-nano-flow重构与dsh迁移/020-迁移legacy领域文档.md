---
name: "020-迁移legacy领域文档"
description: "把 .tmp/nano-flow-legacy 里 common/etf/music/nano-flow/video 的历史领域文档适配成 YAML + 三位编号并迁入 .agents；旧 plans 与二进制截图不迁。"
status: completed
related_noted:
  - '002-生成并迁移dsh领域文档'
  - '019-dream机制设计'
---

# 020-迁移legacy领域文档

## 交付

- 新建/迁移 5 个 domain：`common`、`etf`、`nano-flow`、`music`、`video`（`dsh` 已在 002 完成）。
- 旧 `CONTEXT.md` → YAML 头 + 原 glossary；旧 `QUESTIONS.md` 按条拆成 `questions/NNN-*.md`；旧 `adr/0001-*` → `adr/001-*` + YAML；旧 `workflows/0001-*` → `workflows/001-*` + YAML。
- 统一 `_避免使用_` → `_Avoid_`；旧根手写 `CONTEXT-MAP.md` 废弃，改由 check 从 CONTEXT `relations` 生成。
- 跨域关系保留在源域：nano-flow → common；dsh → nano-flow（本次补进 dsh CONTEXT）。

## 迁移明细

| 域 | 迁移内容 |
| --- | --- |
| common | CONTEXT + 3 questions（catalog / 覆盖率 / 提交钩子）+ 1 ADR |
| etf | CONTEXT + 1 question（1000 根）+ 5 ADR + 1 workflow（行情全量同步） |
| music | CONTEXT（questions 为空） |
| nano-flow | CONTEXT + 4 questions + 4 ADR |
| video | CONTEXT（questions 为空） |

## 不做 / 遗留

- 10 个旧 plans（common 2、etf 2、music 1、nano-flow 4、video 1）仍是 `story.md + spec.md + notes.json` 旧格式。它们属于 Plan 而不是领域文档，按 002/003 的分工另开 note 迁移。
- `music/design/shots` 15 张 PNG（约 7.4 MB）留在 `.tmp`：不是文档，且仓库无对应目录；music 旧 Plan 对它们的引用属于上面 plans 迁移的范围。
- 旧根 `README.md`、`domains/AGENTS.md`（0 字节）不迁。

## 验证

- `nano_flow_check` 通过；生成 `CONTEXT-MAP.md` 与 10 个索引（questions/adr/workflows）。
- 迁移文档的相对链接逐条重指后 0 死链；把已删除的 `dsh-nested-skill` 链接改为 `dsh-toolkit`，并更新覆盖率阈值描述。
- 新问句/ADR 的 `name` 与文件名一致、3 位编号连续。

## 来源

`.tmp/nano-flow-legacy/domains/`（快照保留，可回读原文）。
