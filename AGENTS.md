<!-- GENERAL RULES START -->

遵循原则：第一性原理；结构化思维；批判性思维；奥卡姆剃刀原理；对抗性审查
推理原则：优先采用基于检索的推理，而不是基于预训练知识的推理。

<!-- GENERAL RULES END -->

<!-- LOOP KIT START -->

# Ask Matt

You don't remember every skill, so ask.
A **flow** is a path through the skills. Most paths run along one **main flow**, and two **on-ramps** merge onto it. Everything else is standalone, or a vocabulary layer that runs underneath.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grill-with-docs`** — sharpen the idea by interview. Start here when you **have a codebase**: it's stateful, retaining what it learns in `CONTEXT.md` and ADRs. (No codebase? Use `/grill-me` — see Standalone. Both run the same `/grilling` primitive; `grill-with-docs` is the one that leaves a paper trail.)
2. **Branch — is this a multi-session build?**

- **Yes** → **`/to-spec`** (turn the thread into a spec), then **`/to-tickets`** to split it into tracer-bullet tickets, each declaring its **blocking edges**. On a local tracker that's an ordered `tickets.md` you work by hand; on a real tracker the edges become native blocking links, so any ticket whose blockers are done can be grabbed — kick off **`/implement`** per ticket, **clearing context between each one**.
- **No** → **`/implement`** right here, in the same context window.
  Either way, **`/implement`** chooses sibling test branches by impact surface: frontend and consumer-visible system paths prefer **`/e2e`**, while backend behavior at agreed seams prefers **`/tdd`**; mixed full-stack work runs both branches independently. Once every applicable branch has evidence, it runs **`/verifying`** for the applicable delivery gates, then **`/code-review`** a two-axis review (Standards + Spec), before committing. Reach for **`/e2e`** alone for acceptance assets or real-path testing, **`/tdd`** alone for concrete test-first behavior, **`/verifying`** alone for delivery evidence, **`/code-review`** alone for a branch or PR review.

### Context hygiene

Keep steps 1–2 in **one unbroken context window** — don't compact or clear until after `/to-tickets` — so the grilling, spec, and tickets all build on the same thinking. Each `/implement` then starts fresh, working from the ticket.
The limit on this is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)**: the window (~120k tokens on state-of-the-art models) within which the model still reasons sharply. If a session approaches it before `/to-tickets`, don't push on degraded — `/handoff` and continue in a fresh thread.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → **`/triage`**. It moves issues through triage roles and produces agent-ready issues, which **`/implement`** later picks up.
  Triage is only for issues **you didn't create** — bug reports, incoming feature requests, anything that arrives raw. Tickets that `/to-tickets` produced are already agent-ready, so **don't triage them**.
- **A huge, foggy effort — a greenfield project or a huge feature build, too big for one session** → **`/to-workstreams`**. It splits the effort into independently implementable and verifiable vertical-slice **workstreams**, confirms their boundaries and direct dependencies, writes one shared handoff by **`/handoff`**, and creates an independent session for each one. Each generated workstream merges onto the main flow at **`/grill-with-docs`**.

## Vocabulary underneath

Two model-invoked references that run _beneath_ the other skills — each the single source of truth for its vocabulary. Reach for them directly when the **words**, not the process, are the problem; or let the skills above pull them in.

- **`/domain-modeling`** — sharpen the project's _domain_ language: challenge a fuzzy term, resolve an overloaded word ("account" doing three jobs), record a hard-to-reverse decision as an ADR. It's the active discipline `/grill-with-docs` drives to keep `CONTEXT.md` a clean glossary.
- **`/codebase-design`** — the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality) for designing a module's _shape_: a lot of behaviour behind a small interface at a clean seam. `/tdd` speaks it.

## Crossing sessions

- **`/handoff`** — when a thread is full or you need to branch off, this compacts the conversation into a markdown file. You don't continue in place — you **open a new session and reference that file** to carry the context across. It's the bridge between context windows, in either direction. Use it when you want a **fresh session** but need the **current conversation preserved**.
- **`/compact`** (built-in) — stay in the **same conversation**, letting the earlier turns be summarized. Use it at **intentional breaks between phases**, when you don't mind losing the verbatim history. Don't compact mid-phase — the agent can lose its way. `/handoff` forks; `/compact` continues.

## Standalone

Off the main flow entirely.

- **`/grill-me`** — the same relentless interview as `/grill-with-docs`, but for when you have **no codebase**. Stateless: it saves nothing locally, builds no `CONTEXT.md`. Reach for it to sharpen any plan or design that doesn't live in a repo.
- **`/teach`** — learn a concept over multiple sessions, using the current directory as a stateful workspace.
- **`/writing-great-skills`** — reference for writing and editing skills well.

## Precondition

**`/setup-matt-pocock-skills`** — run before your first engineering flow to configure the issue tracker, triage labels, and doc layout the other skills assume. Custom issue trackers also work.

<!-- LOOP KIT END -->

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default five-role triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context domain-doc layout: root `CONTEXT-MAP.md` points to per-context `CONTEXT.md` files, with ADRs at `docs/adr/` and context-specific `src/<context>/docs/adr/`. See `docs/agents/domain.md`.
