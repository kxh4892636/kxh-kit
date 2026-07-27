<!-- GENERAL RULES START -->

遵循原则：第一性原理；结构化思维；批判性思维；奥卡姆剃刀原理；对抗性审查；
推理原则：优先采用基于检索的推理，而不是基于预训练知识的推理。

<!-- GENERAL RULES END -->

<!-- LOOP KIT START -->

# Ask Matt

You don't remember every skill, so ask.
A **flow** is a path through the skills. Most paths run along one **main flow**, and **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grill-with-docs`** — sharpen the idea by interview. Start here when you **have a codebase**: it's stateful, retaining what it learns in `CONTEXT.md` and ADRs. (No codebase? Use `/grill-me` — see Standalone. Both run the same `/grilling` primitive; `grill-with-docs` is the one that leaves a paper trail.)
2. **`/implement`** — build it in the same context window. It chooses sibling test branches by impact surface: select **`/tdd`** or **`/e2e`**. Once every applicable branch has evidence, it runs **`/verifying`** for the applicable delivery gates, then **`/code-review`** a two-axis review (Standards + Spec), before committing. Reach for **`/e2e`** alone for acceptance assets or real-path testing, **`/tdd`** alone for concrete test-first behavior, **`/verifying`** alone for delivery evidence, **`/code-review`** alone for a branch or PR review.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **A huge, foggy effort — a greenfield project or a huge feature build, too big for one session** → **`/to-workstreams`**. It splits the effort into independently implementable and verifiable vertical-slice **workstreams**, confirms their boundaries and direct dependencies, writes handoff for each one, and creates an independent session for each one. Each generated workstream merges onto the main flow at **`/grill-with-docs`**.

## Vocabulary underneath

Two model-invoked references that run _beneath_ the other skills — each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **`/domain-modeling`** — sharpen the project's _domain_ language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline `/grill-with-docs` drives to keep `CONTEXT.md` a clean glossary.
- **`/codebase-design`** — the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's _shape_: a lot of behaviour behind a small interface at a clean seam. `/tdd` speaks it.

## Standalone

Off the main flow entirely.

- **`/grill-me`** — the same relentless interview as `/grill-with-docs`, but for when you have **no codebase**. Stateless: it saves nothing locally, builds no `CONTEXT.md`. Reach for it to sharpen any plan or design that doesn't live in a repo.
- **`/writing-great-skills`** — reference for writing and editing skills well.

<!-- LOOP KIT END -->

<!-- DOMAIN DOCS START -->

This repository uses a single-context domain documentation layout. See `docs/agents/domain.md`.
`CONTEXT.md` 和 `docs/adr/` 中的文件内容使用中文
`docs/adr/` 中的文件名使用中文
`CONTEXT.md` 行数 <= 610 行，`docs/adr/` 中的 adr 文档数量 <= 89 个, 每个 adr 文档的行数 <= 144 行；文件数量和行数超过限制时进行合并、拆分、移除废弃内容。

<!-- DOMAIN DOCS END -->

<!-- PROJECT RULES START -->

- codin-d2c-cli: invoke `codin-d2c` for Figma design-to-code，d2c 静态资源统一使用 svg 格式；

<!-- PROJECT RULES END -->
