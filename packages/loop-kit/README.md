# @kxh4892636/loop-kit

Install the latest published Kxh Kit agent rules, domain guide, and Loop Kit skills into an existing project.

## Requirements

- Node.js 22.12.0 or later
- An existing target directory

## Usage

```powershell
npx --yes --registry=https://registry.npmjs.org/ @kxh4892636/loop-kit@latest --target .
```

Relative target paths are resolved from the current working directory. The command prints the resolved absolute path, created, updated, and unchanged file counts, and the deleted skill count.

## Installation behavior

- `DOMAIN.md` is replaced with the published version.
- `.agents/skills/loop-kit` is replaced transactionally as a package-owned directory. A successful update removes target-only skills and other stale content; a failed update restores the previous directory.
- `AGENTS.md` manages only the `GENERAL RULES` and `LOOP KIT` marker blocks. Matching blocks are updated, missing blocks are appended, and all other content is preserved. A new `AGENTS.md` contains only those two blocks.
- Duplicate, incomplete, or reversed managed markers stop the installation before any destination is changed.
- Repeating an installation skips unchanged files.
- If a destination write fails, changes from that installation are rolled back before the command exits with a failure status.

Each removed directory containing a `SKILL.md` counts as one deleted skill; other stale content is removed without increasing that count.

## Publishing

The package is published manually. Its `prepack` lifecycle rebuilds the CLI and copies the current workspace versions of `AGENTS.md`, `DOMAIN.md`, and `.agents/skills/loop-kit` into the npm tarball.
