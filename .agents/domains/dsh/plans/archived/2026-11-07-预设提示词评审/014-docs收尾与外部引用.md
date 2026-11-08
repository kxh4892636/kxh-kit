---
name: '014-docs收尾与外部引用'
description: '删除 docs/ 并改 apps/etf、apps/music、packages/nano-flow README 的残留引用，最后跑 workspace 校验。'
status: completed
reason: ''
related_noted:
  - '002-迁移docs全部域到.agents-domains'
  - '013-旧Plan转notes.jsonDAG'
next_step: ''
---

# 014-docs收尾与外部引用

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 范围

- 删除 `docs/`（迁移与 DAG 转换完成后）。
- 改剩余引用：
  - `apps/etf/README.md`：行情全量同步工作流链接。
  - `apps/music/README.md`：部署 Plan 链接。
  - `packages/nano-flow/README.md`：Anki 冒烟检查清单外链。该链指向 GitHub 的 `docs/nano-flow/anki冒烟检查清单.md`，但仓库里没有这个文件（git 无历史）；改指 `.agents/domains/nano-flow/` 下真实存在的文档，或删掉这句。
- `CONTEXT-MAP.md` 与 `notes-guard.ts` 注释由 note 02 改。

## 验收

- `rg "docs/(dsh|common|etf|pi|music|nano-flow)"` 除 git 历史外无命中。
- `nano_flow_check workspace` 通过。
- `git status` 只含预期改动；docs/ 目录不存在。

## 迁移前的证据
- docs/ 已删除（删除前确认 0 个文件）；rg "docs/(dsh|common|etf|pi|music|nano-flow)" 无命中
- apps/etf/README.md 工作流链接改指 .agents/domains/etf
- apps/music/README.md 部署步骤改指该 Plan 的 notes.json（note 06）
- packages/nano-flow/README.md 失效外链改指存在的 skills/nano-flow-cli/references/anki.md
- nano_flow_check workspace 通过
