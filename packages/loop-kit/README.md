# @kxh4892636/loop-kit

Install the latest published Kxh Kit agent rules, domain guide, and Loop Kit skills into an existing project.

## Requirements

- Node.js 22.12.0 or later
- An existing target directory

## Usage

```powershell
npx @kxh4892636/loop-kit@latest --target D:\projects\target
```

Relative target paths are resolved from the current working directory. The command prints the resolved absolute path and the number of created, updated, and unchanged files.

## Installation behavior

- `DOMAIN.md` is replaced with the published version.
- `.agents/skills/loop-kit` is merged by path. Files with the same relative path are replaced; target-only files are preserved.
- `AGENTS.md` manages only the `GENERAL RULES` and `LOOP KIT` marker blocks. Matching blocks are updated, missing blocks are appended, and all other content is preserved. A new `AGENTS.md` contains only those two blocks.
- Duplicate, incomplete, or reversed managed markers stop the installation before any destination is changed.
- Repeating an installation skips unchanged files.
- If a destination write fails, changes from that installation are rolled back before the command exits with a failure status.

## Publishing

The package is published manually. Its `prepack` lifecycle rebuilds the CLI and copies the current workspace versions of `AGENTS.md`, `DOMAIN.md`, and `.agents/skills/loop-kit` into the npm tarball.
