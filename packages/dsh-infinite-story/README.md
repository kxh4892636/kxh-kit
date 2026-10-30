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

Story mode is **off by default** and is scoped to **one session at a time**:

```
story_mode action=status        # what this session has bound
story_mode action=on id=xxx     # bind and turn on — this session only
story_mode action=off           # turn off — this session only
story_mode action=new id=xxx title="…"
```

Binding lives in `.story/sessions/<session-key>.json`, one file per conversation.
Turning the mode on registers the iron-rules section **on that agent's context**, so
other conversations never see it. Tools stay registered (they are global by contract),
but every body checks the caller's binding first and answers `故事模式未开启（本会话）`
when it is off.

One session binds **one** story; switching means a new session.

There is no UI switch yet — see _Known limits_.

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

## Known limits

- **No UI switch yet.** Step 1 (per-session state) is done; step 2 is the client plugin.
  The slot is identified (`conversation.session.header.actions`) and the bundle format is
  `window.__ModuleLoader__.load({ id, factory })`, but client↔host transport and a custom
  client build are still missing.
- **Tool visibility is global.** Tools are registered once for the process; only their
  _behaviour_ is per-session. Hiding them per conversation needs `tools.restrict()`, which
  requires an agent-scoped context and rejects a context-global mask.
- **L2 has no built-in model call**; it hands the work order to the session's subagent.
