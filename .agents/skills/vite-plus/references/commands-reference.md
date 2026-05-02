# Vite+ Commands Reference

## Table of Contents

- [Dev (`vp dev`)](#dev-vp-dev)
- [Build (`vp build`)](#build-vp-build)
- [Preview (`vp preview`)](#preview-vp-preview)
- [Check (`vp check`)](#check-vp-check)
- [Lint (`vp lint`)](#lint-vp-lint)
- [Format (`vp fmt`)](#format-vp-fmt)
- [Test (`vp test`)](#test-vp-test)
- [Run (`vp run` / `vpr`)](#run-vp-run--vpr)
- [Pack (`vp pack`)](#pack-vp-pack)
- [Install & Dependencies (`vp install`, `vp add`, `vp remove`, etc.)](#install--dependencies)
- [Environment (`vp env`)](#environment-vp-env)
- [Running Binaries (`vpx`, `vp exec`, `vp dlx`)](#running-binaries)
- [Commit Hooks (`vp config`, `vp staged`)](#commit-hooks)
- [Task Caching](#task-caching)
- [Upgrade (`vp upgrade`)](#upgrade-vp-upgrade)
- [Remove (`vp implode`)](#remove-vp-implode)

## Dev (`vp dev`)

Starts the Vite development server. Uses standard Vite config in `vite.config.ts`.

```bash
vp dev
```

Configuration: standard Vite config (`vite.config.ts`) — plugins, aliases, `server`, environment modes.

## Build (`vp build`)

Runs the Vite production build. Uses Vite 8 and Rolldown.

```bash
vp build
vp build --watch
vp build --sourcemap
```

> `vp build` always runs the built-in Vite build. Use `vp run build` for `package.json` build scripts.

Configuration: standard Vite config — plugins, aliases, `build`, `preview`, environment modes.

### Preview

```bash
vp build
vp preview
```

## Check (`vp check`)

Runs format, lint, and type checks together. Built on Oxfmt, Oxlint, and tsgolint.

```bash
vp check
vp check --fix                # Format and run autofixers
vp check --no-fmt             # Skip format; run lint (and type-check if enabled)
vp check --no-lint            # Skip lint rules; keep type-check when enabled
vp check --no-fmt --no-lint   # Type-check only (requires typeCheck enabled)
```

Configured via `lint` and `fmt` blocks in `vite.config.ts`.

When `typeCheck` is enabled in `lint.options`, `vp check` also runs TypeScript type checks through tsgolint. Recommended base config:

```ts
export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
```

## Lint (`vp lint`)

Lints code with Oxlint (replacement for ESLint).

```bash
vp lint
vp lint --fix
vp lint --type-aware
```

Configuration in `lint` block of `vite.config.ts`:

```ts
export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
```

- `typeAware: true` — enables rules requiring TypeScript type information
- `typeCheck: true` — enables full type checking during linting (powered by tsgolint)

Do NOT use `oxlint.config.ts` or `.oxlintrc.json` with Vite+.

Oxlint supports JS plugins for ESLint plugins you still depend on during migration.

## Format (`vp fmt`)

Formats code with Oxfmt (drop-in replacement for Prettier).

```bash
vp fmt
vp fmt --check
vp fmt . --write
```

Configuration in `fmt` block of `vite.config.ts`:

```ts
export default defineConfig({
  fmt: {
    singleQuote: true,
  },
});
```

Do NOT use `.oxfmtrc.json` with Vite+.

For VS Code format-on-save, add to `.vscode/settings.json`:

```json
{
  "oxc.fmt.configPath": "./vite.config.ts"
}
```

## Test (`vp test`)

Runs tests with Vitest.

```bash
vp test
vp test watch      # Watch mode
vp test run --coverage
```

> Unlike standalone Vitest, `vp test` does NOT stay in watch mode by default. Use `vp test watch` for watch mode.

Configuration in `test` block of `vite.config.ts`:

```ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

Do NOT use `vitest.config.ts` with Vite+.

Import test utilities from `vite-plus/test` (not `vitest`).

## Run (`vp run` / `vpr`)

Runs `package.json` scripts and tasks defined in `vite.config.ts`. `vpr` is a shorthand for `vp run`.

### Running Scripts

```bash
vp run build        # Run package.json "build" script
vp run              # Interactive task selector (no task name)
```

### Caching

Package.json scripts are NOT cached by default. Use `--cache`:

```bash
vp run --cache build
```

If inputs haven't changed, cached output is replayed instantly.

### Task Definitions (in vite.config.ts)

Tasks defined in `vite.config.ts` are cached by default:

```ts
export default defineConfig({
  run: {
    tasks: {
      build: {
        command: 'vp build',
        dependsOn: ['lint'],
        env: ['NODE_ENV'],
      },
      deploy: {
        command: 'deploy-script --prod',
        cache: false,
        dependsOn: ['build', 'test'],
      },
    },
  },
});
```

A task name can come from `vite.config.ts` or `package.json`, but NOT both.

### Task Dependencies

Use `dependsOn` to run tasks in order. Cross-package dependencies use `package#task`:

```ts
dependsOn: ['@my/core#build', '@my/utils#lint']
```

### Workspace Execution

- **Current package (default):** `vp run build` (in current directory)
- **Explicit package:** `vp run @my/app#build`
- **Recursive (-r):** `vp run -r build` — runs in every workspace package, dependency order
- **Transitive (-t):** `vp run -t @my/app#build` — runs in one package + all its dependencies
- **Filter (--filter):** `vp run --filter @my/app build` — pnpm-style filtering
- **Workspace root (-w):** `vp run -w build`

Filter syntax (pnpm-compatible):

```bash
vp run --filter @my/app build        # By name
vp run --filter "@my/*" build        # By glob
vp run --filter ./packages/app build # By directory
vp run --filter "@my/app..." build   # Include dependencies
vp run --filter "...@my/core" build  # Include dependents
vp run --filter "@my/*" --filter "!@my/utils" build  # Exclude
```

### Compound Commands

Commands joined with `&&` are split into independent sub-tasks, each cached separately:

```json
{
  "scripts": {
    "check": "vp lint && vp build"
  }
}
```

### Nested `vp run`

When a command contains `vp run`, Vite Task inlines it as separate tasks. Each sub-task is cached independently.

A common monorepo pattern (root `build` → `vp run -r build` → includes root's `build`) is automatically detected and pruned to avoid infinite recursion.

### Execution Summary

```bash
vp run -r -v build          # Verbose execution summary
vp run --last-details       # Show summary from last run
```

### Concurrency

Default: up to 4 concurrent tasks.

```bash
vp run -r --concurrency-limit 8 build   # Up to 8 concurrent tasks
vp run -r --concurrency-limit 1 build   # One at a time
vp run -r --parallel dev                # Ignore dependencies, unlimited concurrency
vp run -r --parallel --concurrency-limit 4 dev  # Parallel with cap
```

Set via `VP_RUN_CONCURRENCY_LIMIT` env var. `--concurrency-limit` flag takes priority.

### Additional Arguments

```bash
vp run test --reporter verbose
```

Arguments after the task name pass through to the task command.

## Pack (`vp pack`)

Builds libraries and standalone executables with tsdown.

```bash
vp pack
vp pack src/index.ts --dts
vp pack --watch
```

Configuration in `pack` block of `vite.config.ts`:

```ts
export default defineConfig({
  pack: {
    dts: true,
    format: ['esm', 'cjs'],
    sourcemap: true,
  },
});
```

Do NOT use `tsdown.config.ts` with Vite+.

For web applications, use `vp build` instead.

### Standalone Executables

```ts
export default defineConfig({
  pack: {
    entry: ['src/cli.ts'],
    exe: true,
  },
});
```

Builds native executables that run without Node.js installed separately.

## Install & Dependencies

`vp install` installs dependencies using the current workspace's package manager.

### Package Manager Detection (in order)

1. `packageManager` in `package.json`
2. `pnpm-workspace.yaml`
3. `pnpm-lock.yaml`
4. `yarn.lock` or `.yarnrc.yml`
5. `package-lock.json`
6. `bun.lock` or `bun.lockb`
7. `.pnpmfile.cjs` or `pnpmfile.cjs`
8. `bunfig.toml`
9. `yarn.config.cjs`

If none found, falls back to `pnpm`.

### Install Command

```bash
vp install
vp install --frozen-lockfile
vp install --lockfile-only
vp install --filter web
vp install -w
```

### Global Packages

```bash
vp install -g <pkg>     # Install globally
vp uninstall -g <pkg>   # Remove globally
vp update -g [pkg]      # Update global packages
vp list -g [pkg]        # List global packages
```

### All Dependency Commands

- `vp add <pkg>` — add to dependencies; `-D` for devDependencies; `-O` for optional; `--save-peer` for peer
- `vp remove <pkg>` — remove packages; `--filter web` to scope
- `vp update` — update dependencies
- `vp dedupe` — collapse duplicate dependency entries
- `vp outdated` — show available updates
- `vp list` — show installed packages
- `vp why <pkg>` — explain why a package is present
- `vp info <pkg>` — show registry metadata
- `vp rebuild` — rebuild native modules (e.g. after switching Node.js versions)
- `vp link` / `vp unlink` — manage local package links
- `vp dlx <pkg>` — run a package binary without adding it as a dependency
- `vp pm <command>` — forward raw package-manager-specific command

### Rebuild

```bash
vp rebuild
vp rebuild -- --update-binary
```

`vp rebuild` is shorthand for `vp pm rebuild`.

### Advanced

```bash
vp pm config get registry
vp pm cache clean --force
vp pm exec tsc --version
```

## Environment (`vp env`)

Manages Node.js versions globally and per project. Managed mode is on by default — `node`, `npm`, and related shims resolve through Vite+.

Stores managed runtime in `~/.vite-plus` (override with `VP_HOME`).

### Setup

```bash
vp env setup     # Create or update shims in VP_HOME/bin
vp env on        # Managed mode: shims always use Vite+-managed Node.js
vp env off       # System-first mode: prefer system Node.js
vp env print     # Print shell snippet for current session
```

### Manage

```bash
vp env default <version>     # Set/show global default Node.js version
vp env pin <version>         # Pin version in current directory (writes .node-version)
vp env unpin                 # Remove .node-version
vp env use <version>         # Set version for current shell session
vp env use --unset           # Remove session override
vp env install [version]     # Install a Node.js version
vp env uninstall <version>   # Remove an installed version
vp env exec --node <ver> <cmd>  # Run command with specific Node.js version
vp node <script>             # Shorthand for `vp env exec node`
```

### Inspect

```bash
vp env current               # Current resolved environment
vp env current --json        # JSON output
vp env doctor                # Environment diagnostics
vp env which <tool>          # Show which tool path will be used
vp env list                  # Locally installed Node.js versions
vp env list-remote [--lts]   # Available versions from registry
```

### Examples

```bash
vp env pin lts               # Pin project to latest LTS
vp env install               # Install version from .node-version
vp env default lts           # Set global default
vp env use 22                # Use Node.js 22 for this shell
vp env list-remote --lts     # List LTS versions
vp env exec --node lts npm i # Execute npm with latest LTS
vp node script.js            # Run script with resolved version
```

### Custom Node.js Mirror

Set `VP_NODE_DIST_MIRROR` for corporate proxies or internal mirrors:

```bash
VP_NODE_DIST_MIRROR=https://my-mirror.example.com/nodejs/dist vp env install 22
echo 'export VP_NODE_DIST_MIRROR=https://my-mirror.example.com/nodejs/dist' >> ~/.zshrc
```

## Running Binaries

### `vpx`

Runs any local or remote binary. Resolves locally first, downloads if not found (with `pkg@version`, `--package`, or `--shell-mode` it runs via `vp dlx`).

```bash
vpx <pkg[@version]> [args...]
vpx eslint .
vpx create-vue my-app
vpx typescript@5.5.4 tsc --version
vpx -p cowsay -c 'echo "hi" | cowsay'
```

Options: `-p, --package` (install additional packages), `-c, --shell-mode`, `-s, --silent`

### `vp exec`

Runs a binary from the current project's `node_modules/.bin`:

```bash
vp exec eslint .
vp exec tsc --noEmit
```

### `vp dlx`

Runs a package binary without adding it as a dependency:

```bash
vp dlx create-vite
vp dlx typescript tsc --version
```

## Commit Hooks

### `vp config`

Configures Vite+ for the current project. Installs Git hooks to `.vite-hooks`:

```bash
vp config
vp config --hooks-dir .vite-hooks
```

### `vp staged`

Runs staged-file checks using the `staged` config:

```bash
vp staged
vp staged --verbose
vp staged --fail-on-changes
```

### Configuration

```ts
export default defineConfig({
  staged: {
    '*.{js,ts,tsx,vue,svelte}': 'vp check --fix',
  },
});
```

This replaces `lint-staged`. `vp create` and `vp migrate` prompt to set this up automatically.

## Task Caching

`vp run` can cache task results. When a task succeeds (exit 0), its stdout/stderr is saved. On next run, Vite Task checks:

1. Arguments changed?
2. Environment variables changed? (from `env` list)
3. Input files changed?

If all match, cached output replays instantly. Only terminal output is cached (not output files like `dist/`).

### Cache Enabling

| Control | Effect |
|---------|--------|
| `cache: false` per-task | Opts out; cannot be overridden |
| `--no-cache` / `--cache` CLI flags | Disable/enable for this invocation |
| `run.cache` in config | Workspace-level default |

Default: tasks defined in `vite.config.ts` are cached; `package.json` scripts are not.

### Automatic File Tracking

Vite Task records which files each command reads (source files, config files, `package.json`), including:
- **Missing files:** creating a previously-missing file invalidates the cache
- **Directory listings:** adding/removing files in scanned directories invalidates the cache

### Controlling Input Tracking

```ts
tasks: {
  build: {
    command: 'tsc',
    input: [{ auto: true }, '!**/*.tsbuildinfo'],   // Exclude files
  },
}
```

Can also specify explicit files only (replaces auto-tracking) or disable file tracking entirely with `input: []`.

### Environment Variables

Tasks run in a clean environment. Only `PATH`, `HOME`, `CI`, etc. pass through. Use `env` for cache-fingerprinted vars and `untrackedEnv` for vars available but not affecting caching.

### Cache Sharing

Cache is content-based — same command with same inputs shares cache entries across tasks.

### Cache Commands

```bash
vp cache clean
```

Cache stored in `node_modules/.vite/task-cache` at project root.

## Upgrade (`vp upgrade`)

Two parts to upgrade:

### Global `vp`

```bash
vp upgrade
```

### Local `vite-plus`

```bash
vp update vite-plus
```

Vite+ sets up npm aliases: `vite` → `npm:@voidzero-dev/vite-plus-core@latest`, `vitest` → `npm:@voidzero-dev/vite-plus-test@latest`. To fully upgrade:

```bash
vp update @voidzero-dev/vite-plus-core @voidzero-dev/vite-plus-test
```

Or everything:

```bash
vp update vite-plus @voidzero-dev/vite-plus-core @voidzero-dev/vite-plus-test
```

## Remove (`vp implode`)

Removes `vp` and all Vite+ data from your machine.

```bash
vp implode
vp implode --yes    # Skip confirmation
```
