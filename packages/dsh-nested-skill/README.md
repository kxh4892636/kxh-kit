# dsh-nested-skill

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
discovers **nested skills**: `SKILL.md` files at any depth inside `.agents`
trees, beyond the shipped one-layer form (`.agents/skills/<name>/SKILL.md`).

Typical layout it discovers:

```text
.agents/
└── skills/
    └── loop-x/
        └── references/
            └── skills/
                └── to-story/
                    └── SKILL.md
```

Each nested skill is registered under its frontmatter `name` unchanged, with
rank 250 — a same-name conflict against the shipped one-layer form (rank 200)
resolves in favor of the explicit top-level declaration. Relative resources of
a nested skill resolve against its own directory.

## Install

```powershell
dsh plugin --profile web add file:C:\path\to\repo\packages\dsh-nested-skill
```

The profile's `dsh.profile.bundles` gains the package and its
`cordis.patch.yml` mount. With `patchReload: live` (the shipped `web` profile)
the plugin activates without a restart.

## Verify

Start a new session in the GUI: the nested skills (for example `to-story`,
`quest-with-domain`) appear in the skill catalog, while existing top-level
skills stay visible.

## Uninstall

```powershell
dsh plugin --profile web remove @kxh4892636/dsh-nested-skill
```

## Configuration

All fields are optional and declared for the row's `config`:

| Field                       | Default                           | Meaning                                  |
| --------------------------- | --------------------------------- | ---------------------------------------- |
| `watch`                     | `true`                            | Watch scanned roots for catalog changes. |
| `watchUsePolling`           | `false`                           | Poll instead of native fs events.        |
| `watchPollIntervalMs`       | `100`                             | Poll probe interval.                     |
| `watchStabilityThresholdMs` | `200`                             | Stability window before observation.     |
| `includeUserRoots`          | `true`                            | Scan the user `.agents` root too.        |
| `agentsHome`                | `$DSH_AGENTS_HOME` \| `~/.agents` | User agent root.                         |
| `excludedDirs`              | see source                        | Extra pruned directory names.            |
| `extraRoots`                | `[]`                              | Extra scanned roots (`custom` source).   |

## Development

```powershell
pnpm --filter @kxh4892636/dsh-nested-skill install
pnpm --filter @kxh4892636/dsh-nested-skill test
pnpm --filter @kxh4892636/dsh-nested-skill check
pnpm --filter @kxh4892636/dsh-nested-skill build
```
