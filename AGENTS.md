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
2. **`/implement`** — build it in the same context window. It chooses sibling test branches by impact surface: select **`/tdd`**. Once every applicable branch has evidence, it runs **`/verifying`** for the applicable delivery gates, then **`/code-review`** a two-axis review (Standards + Spec), before committing. Reach for **`/tdd`** alone for concrete test-first behavior, **`/verifying`** alone for delivery evidence, **`/code-review`** alone for a branch or PR review.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **A huge, foggy effort — a greenfield project or a huge feature build, too big for one session** → **`/to-workstreams`**. It splits the effort into independently implementable and verifiable vertical-slice **workstreams**, confirms their boundaries and direct dependencies, writes handoff for each one. Each generated workstream merges onto the main flow at **`/grill-with-docs`**.

## Vocabulary underneath

Two model-invoked references that run _beneath_ the other skills — each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **`/domain-modeling`** — sharpen the project's _domain_ language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline `/grill-with-docs` drives to keep `CONTEXT.md` a clean glossary.
- **`/codebase-design`** — the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's _shape_: a lot of behaviour behind a small interface at a clean seam. `/tdd` speak it.

## Standalone

Off the main flow entirely.

- **`/grill-me`** — the same relentless interview as `/grill-with-docs`, but **stateless**: it saves nothing locally and builds no `CONTEXT.md`. Reach for it when you are **not working in a working directory** — sharpening a plan, a design, a piece of writing, anything with no repo under it. If you are in a working directory, use `/grill-with-docs` instead: it runs the same interview and leaves a paper trail, so it is strictly the better one.
- **`/grilling`** — the interview primitive itself: rounds, the frontier, facts are the agent's job and decisions are yours. `/grill-me` and `/grill-with-docs` are the two named ways in. Reach for it directly only when you want the interview with no wrapper around it.
- **`/wait-what`** — the corrective for a message that didn't land. Use it mid-conversation, inside any other skill, and the agent re-pitches what it just said with the context you were missing, in plain English, using the `CONTEXT.md` vocabulary. It works after the fact; `/grill-with-docs` is the upfront cure, because a shared language agreed early is what stops the jargon arriving at all.
- **`/writing-for-agents`** — reference for writing documents agents consume: skills, AGENTS.md, pointed-at docs.
- **`/to-workflow`** — find recurring patterns in current work, and solidify them as workflows in `docs/workflows/*.md`.
- **`/codin-d2c-cli`** — invoke `codin-d2c` for Figma design-to-code，d2c static resources use svg format；

## Domain Doc

- This repository uses a single-context domain documentation layout. See `DOMAIN.md`.

<!-- LOOP KIT END -->

<!-- PROJECT RULES START -->

Monorepo use vite-plus to manage the project(bootstrap, dependency management, runtime management, testing, packaging, formatting, running, etc), and see `/vite-plus` skill.

<!-- PROJECT RULES END -->
