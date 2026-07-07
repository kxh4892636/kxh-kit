---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue, PRD, or spec asked for?). Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to review since a specific ref.
---

# Code Review

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue, PRD, or spec?

Both axes must run as parallel sub-agents so they do not pollute each other's context, then this skill aggregates their findings. Do not perform the Standards and Spec reviews in the main agent or sequentially. Keep the two axes separate so one does not mask the other.

Use only project context you can verify from files, commands, or user-provided sources. Do not assume a preconfigured issue tracker, domain glossary, ADR layout, or Matt Pocock setup files exist.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point: a commit SHA, branch name, tag, `main`, `HEAD~5`, or another ref. If they did not specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves with `git rev-parse <fixed-point>` and the diff is non-empty. A bad ref or empty diff should fail here, before review work starts.

### 2. Identify the spec source

Look for the originating spec in this order:

1. Issue or PR references in commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), but fetch them only when the repository documents an issue-tracker workflow or the user provided accessible links.
2. A path or URL the user passed as an argument.
3. A PRD, spec, plan, or task file under `docs/`, `specs/`, `.scratch/`, or an equivalent repo-local planning directory matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If there is no spec, skip the Spec axis and report "no spec available".

### 3. Identify the standards sources

Find repo-local documents that define how code should be written, such as `AGENTS.md`, `AGENT.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`, `.agents/skills/**/SKILL.md`, package-level docs, or framework-specific guidance already referenced by the repo.

On top of documented standards, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch. 3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Skip anything tooling already enforces.

Each smell reads *what it is* -> *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name does not reveal what it does or holds. -> Rename it; if no honest name comes, the design is unclear.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. -> Extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. -> Move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together. -> Bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string stands in for a domain concept that deserves its own type. -> Give the concept its own small type.
- **Repeated Switches**: the same `switch` or `if` cascade on the same type recurs across the change. -> Replace with polymorphism, or one shared map.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. -> Gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. -> Split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec does not have. -> Delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller should not depend on. -> Hide the walk behind one method on the first object.
- **Middle Man**: a class or function mostly delegates onward. -> Remove it and call the real target directly.
- **Refused Bequest**: a subclass or implementer ignores or overrides most of what it inherits. -> Drop inheritance and use composition.

### 4. Spawn both sub-agents in parallel

Send a single message with two sub-agent tool calls and run them in parallel. Use the general-purpose/default subagent for both, unless the runtime exposes a more appropriate review worker. If sub-agents are unavailable, stop and report that this skill requires parallel sub-agents.

**Standards prompt**:

- Include the full diff command and commit list.
- Include the standards-source files found in step 3, plus the smell baseline from step 3.
- Brief: "Report, per file/hunk where relevant: (a) every place the diff violates a documented standard, citing the standard file and rule; and (b) any baseline smell spotted, naming the smell and quoting or precisely identifying the hunk. Distinguish hard violations from judgement calls. Documented-standard breaches can be hard; baseline smells are judgement calls; documented repo standards override the baseline. Skip anything tooling enforces. Keep under 400 words."

**Spec prompt**:

- Include the diff command and commit list.
- Include the path, URL, or fetched contents of the spec.
- Brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that was not asked for; (c) requirements that look implemented but where the implementation appears wrong. Quote or precisely identify the spec line for each finding. Keep under 400 words."

If the spec is missing, skip the Spec axis and note that explicitly in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings. Do not merge or rerank findings; the axes are deliberately separate.

End with a one-line summary: total findings per axis and the worst issue within each axis, if any. Do not pick a single winner across axes.

## Why Two Axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing: **Standards pass, Spec fail**.
- Code that does exactly what the issue asked but breaks project conventions: **Spec pass, Standards fail**.

Reporting them separately stops one axis from masking the other.
