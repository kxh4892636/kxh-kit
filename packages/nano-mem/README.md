# Nano Mem

Nano Mem is an offline, local agent-memory CLI backed by SQLite FTS and an FSRS lifecycle. The package exposes one binary, `nnm`, and emits stable JSON for agent callers.

```powershell
nnm --help
nnm --version
```

Memory commands:

```powershell
nnm add "..." --source "..."
nnm search "..."
nnm search "..." --include source --include updatedAt
nnm use <memory-id>
nnm get <memory-id>
nnm list
nnm update <memory-id> "..."
nnm forget <memory-id>
nnm restore <memory-id>
nnm delete <memory-id> --force
```

Search results default to the selector-ready fields `id`, `content`, and `scope`, plus `project` for project memories. Repeat `--include <field>` to add `source`, `createdAt`, or `updatedAt`; unsupported and comma-separated values are rejected. Use `--scope global` for global memory or `--project <name>` for an explicit project. Without either option, the Git root directory name is the project scope. `NANO_MEM_HOME` overrides the user data directory.

Search splits a query on Unicode whitespace. Every derived token inside one word must match, while results are filled from memories matching the most complete words down to fewer words until `--limit` is reached. For example, `nnm search "Pi subagent domain glossary ADR"` can return a memory containing only `Pi` and `subagent` when higher-coverage results do not fill the limit.

Within each matched-word tier, relevance is normalized as `(-BM25) / max(-BM25)` within that tier. Ranking uses an additive score: `0.618 * relevance + 0.382 * (0.618 * retrievability + 0.382 * useScore)`. Successful-use score grows logarithmically and caps at 100 uses. Retrieval counts remain statistics and do not affect ranking or memory stability. Equal total scores are ordered by original BM25 relevance, then memory ID.

The package also contains one managed agent skill:

```powershell
nnm self skill status
nnm self skill install --dry-run
nnm self skill install
nnm self skill update
nnm self skill uninstall
```

The default skill root is `<cwd>/.agents/skills`; use `--target <root>` to select another root. Modified skills require `--force` before replacement or removal.

`nnm self update --dry-run` plans a global npm update and synchronization of an already-installed skill. It selects the newest stable version by default; `--version <semver-or-tag>` chooses an explicit version or npm tag. An absent skill is not implicitly installed, and failures trigger compensating CLI and skill recovery.
