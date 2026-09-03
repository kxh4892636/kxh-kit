# @kxh4892636/pi-nano-subagent

A minimal Pi package for foreground, one-shot delegation to an in-process Fresh Subagent.

## Install

From this repository checkout:

```bash
pnpm --filter @kxh4892636/pi-nano-subagent build
pi install ./packages/pi-nano-subagent
```

Use `-l` for a project-local installation. Restart Pi after installation.

## Use

The package registers one model tool:

```text
subagent({ task: "A complete, self-contained task" })
```

Each call creates an in-memory Pi session in the current working directory and waits for its final answer. The Fresh Subagent:

- inherits the calling model and thinking level;
- does not inherit the parent conversation;
- reloads applicable `AGENTS.md` and other Pi context files;
- receives only `read`, `bash`, `edit`, `write`, `grep`, `find`, and `ls` as working tools;
- receives `subagent` only while its Delegation Depth is below 2.

This permits `main -> sub -> subsub` and rejects a fourth agent level. The parent receives the last non-empty assistant text and nested usage, not reasoning or intermediate tool output. Model-visible output is bounded by Pi's 50 KB/2000-line tool limit; full output remains in tool details.

## Concurrency

Each parent agent may run five direct Subagents concurrently by default. Extra calls wait in FIFO order and leave the queue if cancelled. The limit is per parent, not global: with the default, a fully occupied two-level tree can contain 5 direct Subagents and 25 nested Subagents.

Parallel Subagents share one workspace. The package does not provide transactions, worktrees, or conflict resolution; give concurrent tasks disjoint write scopes.

## Configuration

Create `pi-nano-subagent.json` in Pi's agent directory (normally `~/.pi/agent`):

```json
{
  "maxConcurrency": 5
}
```

`maxConcurrency` is the per-parent direct-Subagent limit and must be an integer from 1 through 64. Missing files use 5. Unknown fields, invalid JSON, unreadable files, and invalid values fail extension loading explicitly. Changes apply after the next Pi startup or `/reload`; one loaded runtime and its recursive delegation tree share an immutable snapshot.

## Scope

The package deliberately does not provide agent profiles, chain or parallel-array protocols, background jobs, resumable conversations, model selection, persistence, or custom TUI rendering. Pi may still execute multiple independent `subagent` tool calls in parallel.
