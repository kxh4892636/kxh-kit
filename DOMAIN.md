# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Rules

- 所有文件内容使用中文, adr 文件名使用中文
- 所有文件(夹)只在工作区/项目根目录创建，不在子仓/子应用目录创建
- `CONTEXT.md` 行数 <= 610 行，`docs/adr/` 中的 adr 文档数量 <= 89 个, 每个 adr 文档的行数 <= 144 行；文件数量和行数超过限制时进行合并、拆分、移除废弃内容。

## Layout

This repository uses a single-context layout:

- `CONTEXT.md` at the repository root contains the domain glossary.
- `docs/adr/` contains architectural decision records.
- `docs/workflows/*.md` 是工作流规格的唯一事实来源。

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- ADRs under `docs/adr/` that touch the area you're about to work in.

If these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-another-decision.md
├── docs/workflows/
│   ├── 0001-example-workflow.md
│   └── 0002-another-workflow.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept isn't in the glossary yet, reconsider whether you're inventing language the project doesn't use or note the genuine gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
