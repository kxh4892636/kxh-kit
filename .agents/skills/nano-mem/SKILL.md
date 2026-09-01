---
name: nano-mem
description: Recall and maintain durable local agent memories through the nm CLI. Use when prior project or global decisions could improve a task, when an adopted memory should be reinforced, or when reusable knowledge should be remembered, corrected, forgotten, restored, or permanently deleted. Keep transient task state and raw conversation outside memory.
---

# Nano Mem

Use `nm` as the deterministic store. Your judgment supplies concise queries, decides semantic conflicts, and distills durable memories.

## Recall

Before work that could benefit from prior decisions or conventions, run one to three precise queries:

```text
nm search "<discriminative terms>" --limit 5
```

Default search already combines the current project with global memory. Add `--scope project|global` or `--project <root-directory-name>` only when the task requires a narrower or explicit context.

Read the success envelope's `data.memories`. Continue silently when it is empty. Bring only the relevant `content`—and `source` when provenance matters—into working context; leave the JSON envelope and lifecycle internals out.

Keep the ID and selector of each memory that materially influences the work. Derive the selector from its DTO:

- `scope: global` → `--scope global`
- `scope: project` → `--scope project --project "<memory.project>"`

Replay that selector on every ID-based command. After actually applying a memory, record the use:

```text
nm use <id> <selector>
```

Search results alone are not use evidence. Recall is complete when relevant content has been selected or the result is empty; reinforcement is complete only after the adopted memory's `use` succeeds.

## Remember or resolve

Distill reusable knowledge into one atomic statement. Prefer the project scope; choose global only for knowledge that should apply across projects.

Search for discriminative terms before every add. Then make one explicit semantic choice:

- No semantic match: `nm add "<atomic memory>" [--source <source>] [--scope global]`.
- Exact normalized match: accept the idempotent `add` result; do not create a variant.
- Same knowledge with a correction: `nm update <id> "<corrected atomic memory>" <selector>`.
- Conflicting or obsolete knowledge: update the authoritative memory or soft-forget the obsolete memory before adding its replacement.

The CLI detects exact duplicates; you own semantic duplicate and conflict decisions. Remembering is complete when the pre-search and the selected single mutation both succeed.

## Forget, restore, or delete

Use `nm forget <id> <selector>` for reversible removal from search. Inspect forgotten memory with `nm get <id> <selector>` or a selector-matched `list`; when it is relevant again, run `nm restore <id> <selector>` and record `use` only after it is actually applied.

Permanent deletion requires the human to identify the target and explicitly request irreversible deletion. Then run:

```text
nm delete <id> --force <selector>
```

Treat a failed envelope as unfinished work. Use its `error.code` and optional `hint` to choose a corrective command; preserve the user's authority boundary when the correction would overwrite or permanently delete data.

## Memory quality

Store durable decisions, conventions, constraints, and reusable lessons. Exclude secrets, raw transcripts, tool output, whole files, speculative claims, and state that matters only to the current task. Keep each memory independently understandable and small enough to update or forget without affecting unrelated knowledge.
