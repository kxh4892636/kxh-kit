# @kxh4892636/pi-session-name

A [pi](https://pi.dev) extension that names each session from its **first user input**, the same
capability as the built-in `/name`, but automatic. Sessions show up in `/session` and the session
picker with a short, recognizable title instead of the raw first prompt.

## Behaviour

- On the first user input of a session, it asks the current model for a title and stores it through
  `pi.setSessionName()` (the API behind `/name`).
- Skill invocations are filtered out of the naming input first: expanded
  `<skill name="…" location="…">…</skill>` blocks (for example from `$name` expansion) and a leading
  `/skill:<name>` command are removed, so the title reflects the user's request. Blocks are stripped
  wherever they appear (an indented closing tag such as `\n   </skill>` and CRLF line endings are
  tolerated). A bare invocation with no remaining request is named after the skill. The message
  actually sent to the model is untouched.
- If there is no model, no configured auth, the request fails, or the reply has no usable text, it
  falls back to a deterministic truncation of the filtered input.
- Names are cleaned and truncated to **21 Unicode code points**: surrounding whitespace, markdown
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

None. It uses the session's current model and a fixed 21-character limit. Extend the `SessionNameOptions`
of the exported factory (or wrap it) if you need a different length, timeout, or token budget.

## How it works

- `input` decides whether this is the first user input: no existing session name, no user message on
  the active branch, and a non-extension source.
- `namingInput()` strips skill blocks and `/skill:` commands from that input before either the model
  request or the fallback sees it.
- `modelRegistry.complete()` with `ctx.model` produces the title, guarded by
  `modelRegistry.hasConfiguredAuth()` and a request timeout.
- `setSessionName()` writes the name; a final `getSessionName()` check avoids clobbering a manual
  `/name`.
- `src/name.ts` holds the pure cleaning/truncation/prompt logic so it can be unit tested without pi.
