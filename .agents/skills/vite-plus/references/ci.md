# Vite+ CI Setup

## GitHub Actions

Use [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp). It installs Vite+, sets up Node.js and package manager, and caches dependencies.

```yaml
# .github/workflows/ci.yml
- uses: voidzero-dev/setup-vp@v1
  with:
    node-version: '22'
    cache: true
- run: vp install
- run: vp check
- run: vp test
- run: vp build
```

With `cache: true`, `setup-vp` handles dependency caching automatically — no separate `setup-node`, package-manager setup, or manual cache steps needed.

## Simplifying Existing Workflows

Replace large blocks of Node, package-manager, and cache setup with a single `setup-vp` step.

### Before:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '24'

- uses: pnpm/action-setup@v4
  with:
    version: 10

- name: Get pnpm store path
  run: pnpm store path

- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}

- run: pnpm install && pnpm dev:setup
- run: pnpm test
```

### After:

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    node-version: '24'
    cache: true

- run: vp install && vp run dev:setup
- run: vp check
- run: vp test
```
