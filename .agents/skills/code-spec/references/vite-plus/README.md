---
name: vite-plus
description: Vite+ 统一前端工具链参考。由 code-spec 按需读取，用于 Vite、Vitest、Oxlint、Oxfmt、Rolldown、tsdown、Vite Task、git hook、vp 命令、配置、迁移或故障排查。关键词：vp、vite-plus、viteplus、vite plus、vite+
---

# Vite+ Reference

Vite+ is the unified toolchain and entry point for web development. It manages runtime, package manager, and frontend toolchain in one place by combining Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, and Vite Task.

**Source repo:** https://github.com/voidzero-dev/vite-plus

**Source docs:** `docs/config` and `docs/guide`

## Completion Standard

A Vite+ answer is complete when it:

- Uses `vp` as the entry point for Vite+ projects instead of falling back to direct package-manager or Vite/Vitest commands.
- Checks the exact local source docs under `references/source-docs/` before answering detailed command, config, migration, CI, IDE, or troubleshooting questions.
- Separates facts from assumptions when project files omit the package manager, Node version, or Vite+ config shape.
- Keeps local project conventions intact and runs the smallest relevant validation command when changing code or toolchain config.

## Two Parts

- `vp` — global command-line tool
- `vite-plus` — local package installed in each project

## When to Use This Reference

- User asks about any `vp` command (dev, build, test, check, lint, fmt, run, pack, create, migrate, install, add, remove, upgrade, implode, env, vpx, etc.)
- User needs help configuring Vite+ (`vite.config.ts` blocks: lint, fmt, test, run, pack, staged)
- User wants to migrate an existing project to Vite+
- User encounters Vite+ errors or issues
- User asks about Vite+ IDE integration or CI setup

## Core Workflow

```bash
vp create               # Create a new project
vp install              # Install dependencies
vp dev                  # Start the dev server
vp check                # Format, lint, type-check
vp test                 # Run tests
vp build                # Build for production
```

## Command Categories

| Category | Commands |
|----------|----------|
| **Start** | `vp create`, `vp migrate`, `vp config`, `vp staged`, `vp install`, `vp env` |
| **Develop** | `vp dev`, `vp check`, `vp lint`, `vp fmt`, `vp test` |
| **Execute** | `vp run` / `vpr`, `vp cache clean`, `vpx`, `vp exec`, `vp dlx` |
| **Build** | `vp build`, `vp pack`, `vp preview` |
| **Dependencies** | `vp add`, `vp remove`, `vp update`, `vp dedupe`, `vp outdated`, `vp list`, `vp why`, `vp info`, `vp rebuild`, `vp link`, `vp unlink`, `vp pm` |
| **Maintain** | `vp upgrade`, `vp implode` |

## Configuration

All configuration lives in `vite.config.ts` using `defineConfig` from `vite-plus`:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  server: {},
  build: {},
  preview: {},
  test: {},
  lint: {},
  fmt: {},
  run: {},
  pack: {},
  staged: {},
});
```

**Important:** Put config in `vite.config.ts` blocks, NOT in separate config files (no `vitest.config.ts`, `oxlintrc.json`, `oxfmtrc.json`, `tsdown.config.ts`).

**Important:** Prefer static `defineConfig({...})` exports. Functional/async configs (`defineConfig((env) => ({...}))`) may not be readable by `vp lint`/`vp fmt`/Oxc editor integrations.

**Important:** Built-in commands (`vp build`, `vp test`, `vp dev`, etc.) cannot be overridden. Use `vp run <script>` to run `package.json` scripts instead.

## Key Concepts

- **Package manager detection:** Reads `packageManager` in `package.json` → `pnpm-workspace.yaml` → lock files → falls back to `pnpm`
- **Task runner (`vp run`):** Runs `package.json` scripts and tasks defined in `vite.config.ts`. Supports caching, dependency ordering, filters, recursive/transitive execution
- **`vpr`:** Shorthand for `vp run`
- **`vp check`:** Runs `vp fmt` + `vp lint` + type-check in a single pass — faster than running separately
- **`vite-plus/test`:** Import test utilities from `vite-plus/test` (not `vitest`)
- **`vp env`:** Manages Node.js versions globally and per project via `.node-version`
- **`typeAware` + `typeCheck`:** Enable in `lint.options` for type-aware linting via tsgolint
- **`create.defaultTemplate`:** Sets the default `vp create` template or organization picker for a repository
- **Monorepos:** Use a root `vite.config.ts` for shared Vite+ tool config, with `lint.overrides` / `fmt.overrides` for package-specific settings

## Source Docs

For detailed information, start with [references/source-map.md](references/source-map.md), then read the matching upstream snapshot under `references/source-docs/`.

| Need | Read |
| --- | --- |
| Getting started, why Vite+, project creation, migration, monorepos | `references/source-docs/guide/index.md`, `why.md`, `create.md`, `migrate.md`, `monorepo.md` |
| Commands such as dev, build, check, lint, fmt, test, run, pack, install, env, vpx, cache, hooks, upgrade, implode | `references/source-docs/guide/<topic>.md` |
| Config blocks such as build, create, fmt, lint, pack, run, staged, test | `references/source-docs/config/<topic>.md` |
| CI, IDE integration, troubleshooting | `references/source-docs/guide/ci.md`, `ide-integration.md`, `troubleshooting.md` |

Do not rely on the deleted summary markdown files for command or config details. Use the mirrored upstream docs when exact wording, options, examples, or changed behavior matter.

## Updating This Reference

The upstream docs are refreshed with the same git-based workflow used by the other `code-spec` reference modules:

```bash
node .agents/skills/code-spec/references/vite-plus/scripts/update-source-docs.mjs
```

The script uses git sparse checkout against:

- `https://github.com/voidzero-dev/vite-plus/tree/main/docs/config`
- `https://github.com/voidzero-dev/vite-plus/tree/main/docs/guide`

After running it, review `references/source-docs/`, `references/source-map.md`, `references/snapshot.json`, and this `README.md`. Keep only this README and the parent `code-spec` Vite+ guidance as local overlays.
