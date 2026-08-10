# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Rules

- All files are created in the repository root, not in sub-repositories;
- `docs/` 目录下的所有文件名和文件内容使用中文;
- `CONTEXT.md` lines <= 610; `docs/adr/*.md` files <= 89, lines <= 144; `docs/workflows/*.md` files <= 55, lines <= 233;
- If any of these limits are exceeded, merge, split, or remove the excess content.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/workflows/`** — read workflows that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs`) and `/to-workflow` skill create them lazily when terms or decisions actually get resolved.

## Layout

This repository uses a single-context layout:

- `CONTEXT.md` at the repository root contains the domain glossary.
- `docs/adr/` contains architectural decision records.
- `docs/workflows/*.md` contains workflow specifications.

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
├── docs/workflows/
│   ├── 0001-ordering-workflow.md
│   └── 0002-billing-workflow.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR and Workflow conflicts

If your output contradicts an existing ADR or Workflow, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
