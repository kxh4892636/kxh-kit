# @kxh4892636/pi-session-name

A [pi](https://pi.dev) extension that names each session from its **first user input**, the same
capability as the built-in `/name`, but automatic. Sessions show up in `/session` and the session
picker with a short, recognizable title instead of the raw first prompt.

## Behaviour

- On the first user input of a session, it asks the current model for a title and stores it through
  `pi.setSessionName()` (the API behind `/name`).
- If there is no model, no configured auth, the request fails, or the reply has no usable text, it
  falls back to a deterministic truncation of the first input.
- Names are cleaned and truncated to **13 Unicode code points**: surrounding whitespace, markdown
  markers, quotes, labels (`标题:` / `title:`) and trailing punctuation are removed.
- Naming is fire-and-forget: the `input` handler returns immediately, so the first turn is never
  blocked.
- Sessions that already have a name, already contain a user message, or whose input comes from
  another extension are left alone. A name set by the user while the model call is in flight is not
  overwritten.

## Install

```bash
pi install /absolute/path/to/packages/pi-session-name
```

The package ships TypeScript and is loaded by pi's jiti loader; it has no runtime dependencies
beyond the pi packages the host already provides.

## Configuration

None. It uses the session's current model and a fixed 13-character limit. Extend the `SessionNameOptions`
of the exported factory (or wrap it) if you need a different length, timeout, or token budget.

## How it works

- `input` decides whether this is the first user input: no existing session name, no user message on
  the active branch, and a non-extension source.
- `modelRegistry.complete()` with `ctx.model` produces the title, guarded by
  `modelRegistry.hasConfiguredAuth()` and a request timeout.
- `setSessionName()` writes the name; a final `getSessionName()` check avoids clobbering a manual
  `/name`.
- `src/name.ts` holds the pure cleaning/truncation/prompt logic so it can be unit tested without pi.
