# dsh-infinite-story

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that runs a
long-form story as a **persistent state machine**: rules live in the system prompt,
state lives on disk, and drift is blocked at write time.

The model writes prose. The plugin owns everything else.

## Why

A story written across dozens of sessions fails in four predictable ways:

| Failure                   | Cause                                       |
| ------------------------- | ------------------------------------------- |
| Prose only exists in chat | "write" and "save" are two separate actions |
| Timed beats get missed    | nothing forces a daily reconciliation       |
| Rules decay               | rules sit in a doc, not in the context      |
| Structure rots            | no gate at write time                       |

This plugin answers each one at the point of failure rather than in documentation.

## Story mode

Story mode is **off by default** and is switched with one tool:

```
story_mode action=status        # what is bound, what exists
story_mode action=on id=xxx     # bind and turn on
story_mode action=off           # turn off — tools and rules are withdrawn
story_mode action=new id=xxx title="…"
```

- **Off**: only `story_mode` is registered. No prompt section, no other tools —
  the plugin is effectively invisible.
- **On**: `story_open` / `story_write` / `story_check` are registered and the
  iron-rules section is injected.

`story_mode` itself always stays visible; without it a session could never come back on.

One session binds **one** story. Switching stories means a new session.

## Tools

| Tool          | What it does                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `story_mode`  | switch, bind, create                                                                           |
| `story_open`  | returns the **Brief**: now, last beat, nearby beats, open threads, foreshadows, pending issues |
| `story_write` | appends prose, writes back the cursor, appends the log, runs L0/L1, **refuses on error**       |
| `story_check` | structural verification + a semantic review work order for a subagent                          |

Everything else — clock, beats, foreshadows, affinity, meters, shards — is **plain
files the model edits directly**. `story_check` verifies afterwards. Adding a new
mechanism adds a schema field and a check rule, never a tool.

## System prompt

`src/prompt.ts` is injected as one fixed section:

- zero variables — no story name, chapter, clock reading or session id
- byte-stable across sessions and stories, so every session shares one cached prefix
- ≤3000 chars; anything story-specific belongs in that story's `RULES.md`

Story content is reached by a **fixed pointer**, never inlined:

```
开工前先读 `.story/ACTIVE.md`
```

`ACTIVE.md` holds three paths and changes with the bound story; the instruction that
points at it never changes.

## Layout

```
.story/
├─ ACTIVE.md                 current story pointer (fixed path)
└─ <id>/
   ├─ STORY.md               entry: where we are, where to look
   ├─ RULES.md               story-specific rules (taboos, address, cadence)
   ├─ WORLD.md               index into shards
   ├─ shards/                chars-core / chars-major / chars-minor / locations / threads
   ├─ state.json             cursor, threads, affinity, meters
   ├─ clock.json             now + advances[]
   ├─ beats.json             timed windows
   ├─ foreshadows.json
   ├─ chapters/NN-*.md
   └─ log/                   timeline · affinity · npc
```

`STORY.md` over 150 lines means something belongs in a shard.

## Verification model

| Tier           | Checks                                                                | When                                           | Cost              |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ----------------- |
| L0 structural  | schema, chapter numbering, cursor, links, quotas, clock monotonic     | every `story_write` (entry + exit)             | free, local       |
| L1 consistency | chapter time vs clock, beat status vs window, affinity level vs value | every `story_write`                            | free, local       |
| L2 semantic    | taboos, voice drift, ending tone, unearned knowledge                  | **once per chapter**, when a new chapter opens | one subagent call |

Frequency is decided by structure, not by the model's mood:

- structure checks are welded to the write path — impossible to skip, costs nothing
- semantic review rides on the **chapter boundary** — one call per chapter, not per scene
- `story_check` is for manual re-verification after editing state files by hand, not a per-turn ritual

L2 is a **work order**, not a hidden call: `story_write` (on a new chapter) and `story_check`
both print exactly what to delegate and what to read, so the review runs in a child context
instead of polluting the session.

## Install

```powershell
pnpm --filter @kxh4892636/dsh-infinite-story build
cd packages/dsh-infinite-story; pnpm pack
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add <abs path to .tgz>
```

The bundle list is composed at boot, so restart the desktop app after installing.

## Migrating a v0 story

```powershell
node packages/dsh-infinite-story/scripts/import-v0.mjs <v0-dir> <workspace> <story-id>
```

Chapters are copied byte-for-byte; JSON is re-shaped; markdown canon is split into shards.

## Known limits

- The on/off switch is a **tool**, not a UI toggle. A client-plugin toggle needs the
  web client's session-header extension point, which is not wired here yet.
- Tool visibility is process-global: `tools.restrict()` requires an agent-scoped
  context, so per-session hiding is not implemented — the switch is workspace-wide.
- L2 has no built-in model call; it hands the work order to the session's subagent.
