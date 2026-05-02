---
name: vite-plus
description: Guide for using Vite+, the unified toolchain for web development. Use this skill when the user asks about Vite+ commands, configuration, migration, or troubleshooting. Vite+ combines Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, and Vite Task into a single CLI. Keywords: vp, vite-plus, viteplus, vp dev, vp build, vp test, vp check, vp lint, vp fmt, vp run, vp pack, vp create, vp migrate, vp install, vp add, vp remove.
---

# Vite+ Skill

Vite+ is the unified toolchain and entry point for web development. It manages runtime, package manager, and frontend toolchain in one place by combining Vite, Vitest, Oxlint, Oxfmt, Rolldown, tsdown, and Vite Task.

**Source repo:** https://github.com/voidzero-dev/vite-plus

## Two Parts

- `vp` — global command-line tool
- `vite-plus` — local package installed in each project

## When to Use This Skill

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

## Reference Files

For detailed information, read the appropriate reference file:

| Reference File | Contents |
|---------------|----------|
| [references/getting-started.md](references/getting-started.md) | Installation, project creation, why Vite+, migration |
| [references/commands-reference.md](references/commands-reference.md) | All command documentation: dev, build, check, lint, fmt, test, run, pack, install, env, vpx, commit-hooks, upgrade, implode, cache |
| [references/config-reference.md](references/config-reference.md) | Full config reference: lint, fmt, test, run, pack, staged, build blocks |
| [references/troubleshooting.md](references/troubleshooting.md) | Common issues, workarounds, asking for help |
| [references/ide-integration.md](references/ide-integration.md) | VS Code and Zed setup |
| [references/ci.md](references/ci.md) | GitHub Actions CI setup with setup-vp |

Read the relevant reference file before answering detailed questions about a specific command or config block.
