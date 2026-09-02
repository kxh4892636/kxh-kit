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
nnm use <memory-id>
nnm get <memory-id>
nnm list
nnm update <memory-id> "..."
nnm forget <memory-id>
nnm restore <memory-id>
nnm delete <memory-id> --force
```

Use `--scope global` for global memory or `--project <name>` for an explicit project. Without either option, the Git root directory name is the project scope. `NANO_MEM_HOME` overrides the user data directory.

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
