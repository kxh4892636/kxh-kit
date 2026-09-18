# @kxh4892636/pi-nested-skill

A [pi](https://pi.dev) extension that closes two gaps in pi's skill handling:

1. **Nested discovery.** pi's skill scanner stops descending as soon as a directory contains
   `SKILL.md`, so a `SKILL.md` under another skill directory (for example
   `.agents/skills/nano-flow/references/skills/questing/SKILL.md`) is invisible. This extension
   finds those hidden skills and contributes them through pi's `resources_discover` seam.
2. **Multiple skills per input.** pi only expands a leading `/skill:name`. This extension adds
   `$skill-name` references that work at any position, several per message.

## Install

```bash
pi install /absolute/path/to/packages/pi-nested-skill
```

The package ships TypeScript and is loaded by pi's jiti loader; it has no runtime dependencies
beyond the pi packages the host already provides.

## Usage

Type `$` anywhere in the input box to open the skill picker (fuzzy-ranked with the same scoring
pi uses for `/`-commands). Pick a skill and it is inserted as `$skill-name `; insert as many as
you like.

```text
refactor the parser $code-spec, then review it $code-review
```

On submit, every `$name` that resolves to a skill is replaced with the same `<skill name location>`
block pi uses for `/skill:name`. Unknown tokens such as `$HOME` are left untouched.

## How it works

- `resources_discover` scans the agent skills dir, the user `~/.agents/skills` dir, project
  `.pi/skills` / `.agents/skills` (trusted projects only), and the directories of skills pi already
  knows about, then returns every `SKILL.md` that sits below another `SKILL.md`.
- `session_start` registers an autocomplete provider with `triggerCharacters: ["$"]` that delegates
  to the built-in provider whenever the cursor is not inside a `$` token.
- The `input` event transforms the raw text before pi's own skill expansion runs.

## Limits

- Project roots are only scanned when the project is trusted.
- Hidden `.`-directories, `node_modules`, `dist`, `build`, `coverage`, and `out` are pruned.
- Newly added or renamed nested skills are picked up on the next `resources_discover` (startup or
  `/reload`).
- Only `$name` references are expanded; `/skill:name` keeps its built-in leading-only behavior.

## Development

```bash
pnpm --filter @kxh4892636/pi-nested-skill test
pnpm --filter @kxh4892636/pi-nested-skill test:coverage
pnpm --filter @kxh4892636/pi-nested-skill check
```
