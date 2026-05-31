# Vite+ Monorepo Reference

Vite+ supports monorepos with a root `vite.config.ts`. Put shared `lint`, `fmt`, `staged`, and `run` defaults at the root, then use overrides for package-specific behavior. Package-level `vite.config.ts` files can still exist for app, framework, build, and test behavior.

## Root Config With Overrides

Use `lint.overrides` for Oxlint rules that apply only to some packages:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    plugins: ['typescript'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
    overrides: [
      {
        files: ['apps/web/**', 'packages/ui/**'],
        plugins: ['typescript', 'react'],
        rules: {
          'react/self-closing-comp': 'error',
        },
      },
      {
        files: ['apps/api/**'],
        env: {
          node: true,
        },
        rules: {
          'no-console': 'off',
        },
      },
      {
        files: ['**/*.test.ts', '**/*.spec.ts'],
        plugins: ['typescript', 'vitest'],
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          'vitest/no-disabled-tests': 'error',
        },
      },
    ],
  },
});
```

Globs are resolved from the root config, so use workspace paths such as `apps/web/**`, `apps/api/**`, and `packages/ui/**`.

When a `lint.overrides` entry sets `plugins`, that list replaces base `lint.plugins` for matched files. Include every plugin needed by that file group, such as `['typescript', 'react']`. Omit `plugins` only when the override should inherit the base list.

## Format Overrides

Use `fmt.overrides` for file or package-specific Oxfmt options. Formatter overrides put settings under `options`:

```ts
import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    semi: true,
    overrides: [
      {
        files: ['apps/api/**'],
        options: {
          printWidth: 120,
        },
      },
      {
        files: ['**/*.md'],
        options: {
          proseWrap: 'always',
        },
      },
    ],
  },
});
```

## Composing Configuration Files

Because `vite.config.ts` is JavaScript, shared config can be split into nearby files or packages and merged into root overrides.

```ts
// tooling/lint/react.ts
import type { OxlintOverride } from 'vite-plus/lint';

export const reactLint = {
  plugins: ['typescript', 'react'],
  rules: {
    'react/self-closing-comp': 'error',
  },
} satisfies Omit<OxlintOverride, 'files'>;
```

```ts
// tooling/lint/node.ts
import type { OxlintOverride } from 'vite-plus/lint';

export const nodeLint = {
  env: {
    node: true,
  },
  rules: {
    'no-console': 'off',
  },
} satisfies Omit<OxlintOverride, 'files'>;
```

```ts
// vite.config.ts
import { defineConfig } from 'vite-plus';

import { nodeLint } from './tooling/lint/node';
import { reactLint } from './tooling/lint/react';

export default defineConfig({
  lint: {
    plugins: ['typescript'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['apps/web/**', 'packages/ui/**'],
        ...reactLint,
      },
      {
        files: ['apps/api/**'],
        ...nodeLint,
      },
    ],
  },
});
```

This keeps shared behavior centralized while letting each team or package own the specific config it needs.

## App Commands

Use the root config for shared tool behavior and task definitions. For project-specific dev, build, and test behavior, choose the command shape that matches the app:

```bash
vp dev apps/web
vp build apps/web
```

Keep package-specific scripts when commands differ per app:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json"
  }
}
```

Run scripts across the workspace with `vp run`:

```bash
vp run -r build
vp run -r --parallel dev
vp run --filter ./apps/web build
```

Use `commands-reference.md` for recursive, parallel, filtered, and cached workspace task details.
