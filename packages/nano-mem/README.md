# Nano Mem

Nano Mem is an offline, local agent-memory CLI backed by SQLite FTS and an FSRS lifecycle. The package exposes one binary, `nm`, and emits stable JSON for agent callers.

```powershell
nm --help
nm --version
```

Memory commands:

```powershell
nm add "..." --source "..."
nm search "..."
nm use <memory-id>
nm get <memory-id>
nm list
nm update <memory-id> "..."
nm forget <memory-id>
nm restore <memory-id>
nm delete <memory-id> --force
```

Use `--scope global` for global memory or `--project <name>` for an explicit project. Without either option, the Git root directory name is the project scope. `NANO_MEM_HOME` overrides the user data directory.

The package also contains one managed agent skill:

```powershell
nm self skill status
nm self skill install --dry-run
nm self skill install
nm self skill update
nm self skill uninstall
```

The default skill root is `<cwd>/.agents/skills`; use `--target <root>` to select another root. Modified skills require `--force` before replacement or removal.

`nm self update --dry-run` plans a global npm update and synchronization of an already-installed skill. It selects the newest stable version by default; `--version <semver-or-tag>` chooses an explicit version or npm tag. An absent skill is not implicitly installed, and failures trigger compensating CLI and skill recovery.
