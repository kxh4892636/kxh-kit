# dsh-nested-skill

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
discovers **nested skills**: `SKILL.md` files at any depth inside `.agents`
trees, beyond the shipped one-layer form (`.agents/skills/<name>/SKILL.md`).

Typical layout it discovers:

```text
.agents/
└── skills/
    └── nano-flow/
        └── references/
            └── skills/
                └── questing/
                    └── SKILL.md
```

Each nested skill is registered under its frontmatter `name` unchanged. Its rank
is its own source's shipped one-layer rank plus one — `201` for the project
`.agents` root, `301` for `customSkillDirs`-style extra roots, `501` for the
user `.agents` root — so a same-name conflict resolves in favor of the explicit
top-level declaration within one source, while cross-source precedence still
follows the harness order (project `200` > custom `300` > user `500` > bundled
`600`). Relative resources of a nested skill resolve against its own directory.
When a scanned root's watcher fails to start, discovery reports `complete: false`
alongside its candidates, so the registry keeps the catalog provisional instead of
caching it.

## Compatibility

Built and verified against DSH `0.2.1-rc.2` (the `latest` release channel). The
DSH peers (`@deepseek-ai/dsh-fs`, `@deepseek-ai/dsh-skill`,
`@deepseek-ai/dsh-home-paths`) are pinned to that exact version rather than a
range: `^0.2.1-rc.2` would also accept `0.2.1-rc.3`, whose own peers demand
`rc.3`, reintroducing the mixed install ADR-0003 rules out.

`dsh` 0.2.x evaluates a plugin's manifest before it activates one: with no
`engines.dsh` field, every `@deepseek-ai/dsh*` peer range must include the
running version. A host bump therefore refuses to load this plugin until the
pins are re-checked and re-aligned — the intended behavior, not an accident.

Provider contract types come straight from the peers (`@deepseek-ai/dsh-skill`,
`@deepseek-ai/dsh-fs`); skill-name validation uses the host's own `isSkillName`
and the user root is resolved with the host's `resolveAgentsHome`, so the package
follows the harness contract instead of mirroring it.

## Install

```powershell
dsh plugin --profile web add <absolute path to the packed .tgz>
```

The profile's `dsh.profile.bundles` gains the package and its
`cordis.patch.yml` mount; the bundle list is composed at boot, so a running host
picks the plugin up on its next start. A local `.tgz` keeps the install decoupled
from this checkout (a `file:` dependency is a link projection, so every rebuild
would need a re-sync).

## Verify

Start a new session in the GUI: the nested skills (for example `questing`,
`code-delivery`) appear in the skill catalog, while existing top-level
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
