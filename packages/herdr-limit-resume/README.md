# Limit Resume

Limit Resume is a Herdr 0.8.2+ plugin that resumes rate-limited agents. It watches every agent
type in every workspace. When a `blocked`, `done`, or `idle` agent's latest detection region
contains both `429` and `limit`, it sends `go on`.

The detection region is an approximation: whitespace is collapsed and only the final 233 Unicode
characters are checked. `limit` is case-insensitive. A status event triggers an immediate check;
a startup worker also checks immediately and every 30 seconds to compensate for missed events.

## Install

Install the GitHub subdirectory and then restart Herdr or perform a live handoff:

```console
herdr plugin install kxh4892636/kxh-kit/packages/herdr-limit-resume
herdr server live-handoff
```

For local development, build and link this checkout:

```console
corepack pnpm --filter @kxh4892636/herdr-limit-resume build
herdr plugin link ./packages/herdr-limit-resume --disabled
herdr plugin enable kxh.limit-resume
herdr server live-handoff
```

Linking or enabling a plugin does not invoke its startup hook. Restarting Herdr or running a live
handoff is required to start the compensation worker. The `Scan rate-limited agents now` action is
available for an immediate manual scan.

## Operation and risk

`done` and `idle` agents receive `go on` through `agent.prompt`. A `blocked` agent receives raw pane
input plus Enter because `agent.prompt` cannot submit while the agent is blocked. That raw input can
interact with whichever prompt is currently visible; the plugin rechecks the pane, status cycle,
terminal, and revision immediately before delivery, but cannot make raw terminal input risk-free.

The worker is best-effort and is not supervised by Herdr. If it crashes, the event hook and manual
action still work, but periodic scans resume only after the next Herdr restart or live handoff. A
per-session lease prevents duplicate startup workers; stale leases expire automatically. Disabling,
unlinking, or uninstalling the plugin makes a running worker exit at its next lifecycle check before
it sends new input.

## Diagnostics and state

Inspect Herdr hook output with:

```console
herdr plugin log list --plugin kxh.limit-resume --limit 100
herdr plugin config-dir kxh.limit-resume
```

Herdr supplies the plugin-owned state path as `HERDR_PLUGIN_STATE_DIR`. It contains per-session
deduplication state, leases, and bounded `diagnostics-*.jsonl` files with up to three rotated files.
Diagnostics record trigger, result code, pane/terminal identifiers, a session shard, and an optional
region hash; terminal text is never logged. The config directory command is useful for locating the
adjacent managed plugin area, although this plugin currently has no user configuration.

## Disable or remove

For an installed plugin:

```console
herdr plugin disable kxh.limit-resume
herdr plugin uninstall kxh.limit-resume
```

For a locally linked plugin, disable it and use `herdr plugin unlink kxh.limit-resume` instead. An
already-running worker observes the disabled or missing registry entry and exits within one scan
interval; restart or live handoff after re-enabling to start it again.
