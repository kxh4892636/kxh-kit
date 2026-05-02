# Getting Started with Vite+

## Why Vite+?

Vite+ unifies the JavaScript toolchain: Node.js runtime, package manager, dev server, linter, formatter, test runner, bundler, and task runner — all in one CLI.

It integrates:
- [Vite](https://vite.dev/) and [Rolldown](https://rolldown.rs/) for development and application builds
- [Vitest](https://vitest.dev/) for testing
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) and [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) for linting and formatting
- [tsdown](https://tsdown.dev/) for library builds or standalone executables
- [Vite Task](https://github.com/voidzero-dev/vite-task) for task orchestration

## Install `vp`

### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

### Windows

```powershell
irm https://vite.plus/ps1 | iex
```

Or download and run `vp-setup.exe` from https://setup.viteplus.dev.

> **SmartScreen warning:** `vp-setup.exe` is not yet code-signed. Click "..." → "Keep" → "Keep anyway" to proceed. If Windows Defender blocks it, click "More info" → "Run anyway".

After installation, open a new shell and run:

```bash
vp help
```

> Vite+ manages your global Node.js runtime and package manager by default. To opt out: `vp env off`. To remove Vite+: `vp implode`.

## Supported Platforms

**Tier 1:** Linux x64 glibc, Linux arm64 glibc, Windows x64, macOS x64, macOS arm64
**Tier 2:** Windows arm64
**Experimental:** Linux x64 musl
**Other:** Linux arm64 musl

On Alpine Linux (musl), install `libstdc++` first:

```sh
apk add libstdc++
```

This is needed because the managed Node.js runtime depends on the GNU C++ standard library.

## Quick Start

```bash
vp create    # Create a new project
vp install   # Install dependencies
vp dev       # Start the dev server
vp check     # Format, lint, type-check
vp test      # Run tests
vp build     # Build for production
```

Running `vp` alone opens an interactive command line.

## Creating a Project (`vp create`)

`vp create` interactively scaffolds new projects, monorepos, and apps.

### Usage

```bash
vp create
vp create <template>
vp create <template> -- <template-options>
```

### Built-in Templates

- `vite:monorepo` — new monorepo
- `vite:application` — new application
- `vite:library` — new library
- `vite:generator` — new generator

### Template Sources

- Shorthand templates: `vite`, `@tanstack/start`, `svelte`, `next-app`, `nuxt`, `react-router`, `vue`
- Full package names: `create-vite`, `create-next-app`
- Local templates: `./tools/create-ui-component`, `@acme/generator-*`
- Remote templates: `github:user/repo`, `https://github.com/user/template-repo`

### Options

- `--directory <dir>` — target directory
- `--agent <name>` — create agent instructions files
- `--editor <name>` — write editor config files
- `--hooks` / `--no-hooks` — pre-commit hook setup
- `--no-interactive` — run without prompts
- `--verbose` — detailed scaffolding output
- `--list` — print available templates

### Template Options

Arguments after `--` pass through to the template:

```bash
vp create vite -- --template react-ts
```

### Examples

```bash
vp create                    # Interactive mode
vp create vite:monorepo      # Vite+ monorepo
vp create vite:application   # Vite+ application
vp create vite:library       # Vite+ library
vp create vite:generator     # Vite+ generator
vp create vite               # Shorthand community template
vp create @tanstack/start
vp create svelte
vp create create-vite        # Full package name
vp create create-next-app
vp create github:user/repo   # Remote template
```

## Migrating to Vite+ (`vp migrate`)

`vp migrate` consolidates separate Vite, Vitest, Oxlint, Oxfmt, ESLint, and Prettier setups into Vite+.

### Usage

```bash
vp migrate
vp migrate <path>
vp migrate --no-interactive
```

### Options

- `--agent <name>` / `--no-agent` — agent instruction setup
- `--editor <name>` / `--no-editor` — editor config setup
- `--hooks` / `--no-hooks` — pre-commit hook setup
- `--no-interactive` — run without prompts

### Migration Flow

The command:
1. Updates project dependencies
2. Rewrites imports where needed
3. Merges tool-specific config into `vite.config.ts`
4. Updates scripts to the Vite+ command surface
5. Can set up commit hooks
6. Can write agent and editor configuration files

Most projects will need further manual adjustments after migration.

### Recommended Workflow

**Before migration:**
- Upgrade to Vite 8+ and Vitest 4.1+ first
- Understand any existing lint, format, or test setup to preserve

**After migration:**
- Run `vp install`
- Run `vp check`
- Run `vp test`
- Run `vp build`

### Migration Prompt (for coding agents)

```
Migrate this project to Vite+. Vite+ replaces the current split tooling around runtime management, package management, dev/build/test commands, linting, formatting, and packaging. Run `vp help` to understand Vite+ capabilities and `vp help migrate` before making changes. Use `vp migrate --no-interactive` in the workspace root. Make sure the project is using Vite 8+ and Vitest 4.1+ before migrating.

After the migration:
- Confirm `vite` imports were rewritten to `vite-plus` where needed
- Confirm `vitest` imports were rewritten to `vite-plus/test` where needed
- Remove old `vite` and `vitest` dependencies only after those rewrites are confirmed
- Move remaining tool-specific config into the appropriate blocks in `vite.config.ts`

Command mapping:
- `vp run <script>` → equivalent of `pnpm run <script>`
- `vp test` → built-in test command; `vp run test` → `package.json` test script
- `vp install`, `vp add`, `vp remove` → delegate through package manager
- `vp dev`, `vp build`, `vp preview`, `vp lint`, `vp fmt`, `vp check`, `vp pack` → replace standalone tools
- Prefer `vp check` for validation loops

After migration: `vp install`, `vp check`, `vp test`, `vp build`

Summarize the migration and report any manual follow-up required.
```

### Tool-Specific Migrations

#### Vitest

Update imports to `vite-plus/test`:

```ts
// before
import { describe, expect, it, vi } from 'vitest';
const { page } = await import('@vitest/browser/context');

// after
import { describe, expect, it, vi } from 'vite-plus/test';
const { page } = await import('vite-plus/test/browser/context');
```

#### tsdown

Move `tsdown.config.ts` into the `pack` block in `vite.config.ts`, then delete `tsdown.config.ts`.

#### lint-staged

Replace with the `staged` block in `vite.config.ts`. Only JSON format `.lintstagedrc` is supported for auto-migration; standalone non-JSON `.lintstagedrc` and `lint-staged.config.*` are not migrated automatically.

```ts
export default defineConfig({
  staged: {
    '*.{js,ts,tsx,vue,svelte}': 'vp check --fix',
  },
});
```

Remove lint-staged from dependencies and delete lint-staged config files.
