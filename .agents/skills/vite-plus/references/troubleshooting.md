# Vite+ Troubleshooting

> Vite+ is still in alpha. Frequent changes are being made.

## Supported Tool Versions

- Vite 8 or newer
- Vitest 4.1 or newer

Upgrade these first before adopting Vite+.

## `vp check` does not run type-aware lint rules or type checks

- Confirm `lint.options.typeAware` and `lint.options.typeCheck` are enabled in `vite.config.ts`
- Check if `tsconfig.json` uses `compilerOptions.baseUrl` — tsgolint does NOT support `baseUrl`, so Vite+ skips `typeAware` and `typeCheck` when it's present

## `vp lint` / `vp fmt` may fail to read `vite.config.ts`

**What is currently supported:**
- Static object exports: `export default { ... }` or `export default defineConfig({ ... })`

**What can fail:**
- Functional or async config: `defineConfig((env) => ({ ... }))` or `defineConfig(async (env) => ({ ... }))`
- Config files relying on Vite transform/bundling behavior (issue #930)

Oxc-side integrations can behave closer to native ESM loading than Vite's bundled loader.

**Workarounds:**
- Prefer static `defineConfig({ ... })` exports for lint/fmt in `vite.config.ts`
- Avoid Node-specific globals (`__dirname` in ESM), unresolved TS-only imports, or JSON imports without import attributes in config code used by lint/fmt
- Temporarily fall back to `.oxlintrc.*` / `.oxfmtrc.*` only if necessary (not recommended normally)

**VS Code multi-root workspace:** the shared Oxc language server may pick a different workspace. Confirm the extension is using the intended workspace with a recent Oxc toolchain.

## `vp build` does not run my build script

Built-in commands cannot be overwritten:
- `vp build` → always runs the built-in Vite build
- `vp test` → always runs the built-in Vitest command
- `vp run build` / `vp run test` → run `package.json` scripts instead

## Staged Checks and Commit Hooks

If `vp staged` fails or pre-commit hooks don't run:
- Ensure `vite.config.ts` has a `staged` block
- Run `vp config` to install hooks
- Check if `VITE_GIT_HOOKS=0` disabled hook installation

Minimal staged config:

```ts
export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
});
```

## Slow Config Loading from Heavy Plugins

Use `lazyPlugins` to load plugins only for commands that need them (`dev`, `build`, `test`, `preview`):

```ts
import { defineConfig, lazyPlugins } from 'vite-plus';
import myPlugin from 'vite-plugin-foo';

export default defineConfig({
  plugins: lazyPlugins(() => [myPlugin()]),
});
```

For heavy plugins, combine with dynamic `import()`:

```ts
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  plugins: lazyPlugins(async () => {
    const { default: heavyPlugin } = await import('vite-plugin-heavy');
    return [heavyPlugin()];
  }),
});
```

## Asking for Help

- [Discord](https://discord.gg/cAnsqHh5PX) for real-time troubleshooting
- [GitHub](https://github.com/voidzero-dev/vite-plus) for issues and discussions

Include when reporting:
- Full output of `vp env current` and `vp --version`
- Package manager used by the project
- Exact steps to reproduce + your `vite.config.ts`
- Minimal reproduction repository or sandbox
