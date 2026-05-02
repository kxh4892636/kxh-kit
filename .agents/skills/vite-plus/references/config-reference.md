# Vite+ Configuration Reference

All Vite+ configuration lives in `vite.config.ts` using `defineConfig` from `vite-plus`.

## Table of Contents

- [Overview](#overview)
- [Build Config](#build-config)
- [Lint Config](#lint-config)
- [Format Config](#format-config)
- [Test Config](#test-config)
- [Run Config](#run-config)
- [Pack Config](#pack-config)
- [Staged Config](#staged-config)

## Overview

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Standard Vite config
  server: {},
  build: {},
  preview: {},

  // Vite+-specific config
  test: {},
  lint: {},
  fmt: {},
  run: {},
  pack: {},
  staged: {},
});
```

**Prefer static `defineConfig({...})` exports.** Functional/async configs (`defineConfig((env) => ({...}))`) may not be readable by `vp lint`/`vp fmt`/Oxc editor integrations.

## Build Config

Standard Vite configuration for `vp dev`, `vp build`, `vp preview`.

```ts
export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    sourcemap: true,
  },
  preview: {
    port: 4173,
  },
});
```

Uses: plugins, aliases, `server`, `build`, `preview`, environment modes.
References: [Vite config docs](https://vite.dev/config/), [using plugins](https://vite.dev/guide/using-plugins), [aliases](https://vite.dev/config/shared-options#resolve-alias), [server options](https://vite.dev/config/server-options), [build options](https://vite.dev/config/build-options), [preview options](https://vite.dev/config/preview-options), [env and mode](https://vite.dev/guide/env-and-mode).

## Lint Config

`vp lint` and `vp check` read Oxlint settings from the `lint` block.

```ts
export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-console': ['error', { allow: ['error'] }],
    },
  },
});
```

- `typeAware: true` — enables rules requiring TypeScript type information
- `typeCheck: true` — enables full type checking during linting (powered by tsgolint)

Recommended: enable both `typeAware` and `typeCheck`.

Reference: [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config.html), [JS plugin support](https://oxc.rs/docs/guide/usage/linter/js-plugins).

## Format Config

`vp fmt` and `vp check` read Oxfmt settings from the `fmt` block.

```ts
export default defineConfig({
  fmt: {
    ignorePatterns: ['dist/**'],
    singleQuote: true,
    semi: true,
    sortPackageJson: true,
  },
});
```

Reference: [Oxfmt configuration](https://oxc.rs/docs/guide/usage/formatter/config.html).

## Test Config

`vp test` reads Vitest settings from the `test` block.

```ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
```

Reference: [Vitest configuration](https://vitest.dev/config/).

## Run Config

Configure Vite Task under the `run` field.

```ts
export default defineConfig({
  run: {
    enablePrePostScripts: true,
    cache: { /* ... */ },
    tasks: { /* ... */ },
  },
});
```

### `run.enablePrePostScripts`

- **Type:** `boolean`
- **Default:** `true`

Whether to automatically run `preX`/`postX` `package.json` scripts as lifecycle hooks when script `X` is executed.

```ts
export default defineConfig({
  run: {
    enablePrePostScripts: false,  // Disable pre/post lifecycle hooks
  },
});
```

**Warning:** Can only be set in the workspace root's `vite.config.ts`.

### `run.cache`

- **Type:** `boolean | { scripts?: boolean, tasks?: boolean }`
- **Default:** `{ scripts: false, tasks: true }`

Controls whether task results are cached and replayed.

```ts
export default defineConfig({
  run: {
    cache: {
      scripts: true,   // Cache package.json scripts (default: false)
      tasks: true,     // Cache task definitions (default: true)
    },
  },
});
```

`cache: true` enables both; `cache: false` disables both.

### `run.tasks`

- **Type:** `Record<string, TaskConfig>`

Defines tasks runnable with `vp run <task>`.

#### `command`

- **Type:** `string`

Shell command to run. Each task MUST include its own `command`. Task names cannot overlap between `vite.config.ts` and `package.json`.

```ts
tasks: {
  build: {
    command: 'vp build',
  },
}
```

#### `dependsOn`

- **Type:** `string[]`
- **Default:** `[]`

Tasks that must complete before this one starts.

```ts
tasks: {
  deploy: {
    command: 'deploy-script --prod',
    dependsOn: ['build', 'test'],
  },
}
```

Cross-package dependencies: `dependsOn: ['@my/core#build', '@my/utils#lint']`

#### `cache`

- **Type:** `boolean`
- **Default:** `true`

Whether to cache this task's output.

```ts
tasks: {
  dev: {
    command: 'vp dev',
    cache: false,
  },
}
```

#### `env`

- **Type:** `string[]`
- **Default:** `[]`

Environment variables included in the cache fingerprint.

```ts
tasks: {
  build: {
    command: 'vp build',
    env: ['NODE_ENV'],
  },
}
```

Wildcards supported: `VITE_*` matches all variables starting with `VITE_`.

#### `untrackedEnv`

- **Type:** `string[]`

Environment variables passed to the task but NOT in cache fingerprint.

```ts
tasks: {
  build: {
    command: 'vp build',
    untrackedEnv: ['CI', 'GITHUB_ACTIONS'],
  },
}
```

Auto-passed vars: `HOME`, `USER`, `PATH`, `SHELL`, `LANG`, `TZ`, `NODE_OPTIONS`, `COREPACK_HOME`, `PNPM_HOME`, `CI`, `VERCEL_*`, `NEXT_*`, `TERM`, `COLORTERM`, `FORCE_COLOR`, `NO_COLOR`.

#### `input`

- **Type:** `Array<string | { auto: boolean } | { pattern: string, base: "workspace" | "package" }>`
- **Default:** `[{ auto: true }]`

Controls which files affect cache validity.

**Exclude files from auto-tracking:**

```ts
tasks: {
  build: {
    command: 'vp build',
    input: [{ auto: true }, '!**/*.tsbuildinfo', '!dist/**'],
  },
}
```

**Specify explicit files only (no auto-tracking):**

```ts
tasks: {
  build: {
    command: 'vp build',
    input: ['src/**/*.ts', 'vite.config.ts'],
  },
}
```

**Resolve patterns relative to workspace root:**

```ts
tasks: {
  build: {
    command: 'vp build',
    input: [
      { auto: true },
      { pattern: 'shared-config/**', base: 'workspace' },
    ],
  },
}
```

The `base` field controls glob resolution:
- `"package"` — relative to package directory (default for string globs)
- `"workspace"` — relative to workspace root

**Disable file tracking entirely:**

```ts
tasks: {
  greet: {
    command: 'node greet.mjs',
    input: [],
  },
}
```

#### `cwd`

- **Type:** `string`
- **Default:** package root

Working directory for the task, relative to the package root.

```ts
tasks: {
  'test-e2e': {
    command: 'vp test',
    cwd: 'tests/e2e',
  },
}
```

## Pack Config

`vp pack` reads tsdown settings from the `pack` block.

```ts
export default defineConfig({
  pack: {
    dts: true,
    format: ['esm', 'cjs'],
    sourcemap: true,
  },
});
```

Reference: [tsdown configuration](https://tsdown.dev/options/config-file). See also [dts](https://tsdown.dev/options/dts), [output formats](https://tsdown.dev/options/output-format), [watch mode](https://tsdown.dev/options/watch-mode), [executables](https://tsdown.dev/options/exe#executable).

## Staged Config

`vp staged` and `vp config` read staged-file rules from the `staged` block.

```ts
export default defineConfig({
  staged: {
    '*.{js,ts,tsx,vue,svelte}': 'vp check --fix',
  },
});
```

This replaces `lint-staged` configuration.
