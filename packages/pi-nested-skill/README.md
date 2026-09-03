# @kxh4892636/pi-nested-skill

A Pi package that discovers skills nested below another loaded skill and expands
multiple `/skill:<name>` markers anywhere in one user input.

Pi remains responsible for frontmatter parsing, validation, catalog registration,
source precedence, collision diagnostics, and the system prompt.

## Install

From this repository checkout:

```bash
pnpm --filter @kxh4892636/pi-nested-skill build
pi install ./packages/pi-nested-skill
```

Use `-l` for a project-local installation. Restart Pi after installation.

## Use

Write any loaded skill name at the point where its instructions should appear:

```text
Use /skill:to-story to shape this request, then /skill:code-design to design it.
```

Every occurrence is replaced from left to right with the same `<skill>` block Pi
uses for a native skill command. The surrounding text and image attachments are
preserved as one shared user input. Repeating a marker repeats its skill block.
In the interactive transcript, inline skill blocks are summarized as visible
`[skill] <name>` markers so later expanded skills do not disappear inside
Markdown HTML rendering.

Markers work in interactive and RPC input, including input-hook steer and
follow-up delivery. Extension-injected messages are not transformed.

## Discovery and reload

The package scans below each skill already accepted by Pi. It honors hidden
directories, `node_modules`, `.gitignore`, `.ignore`, and `.fdignore`, and does
not follow directory symlinks or junctions. New, removed, or changed nested
skills become visible after `/reload` (or the next Pi startup).

## Marker rules and limitations

- A marker must be an independent `/skill:<catalog-name>` token; URL and path
  fragments do not expand.
- Escape a literal marker as `\/skill:name`. The backslash is preserved.
- Unknown markers and markers whose skill file cannot be read remain unchanged;
  a read failure emits a warning and does not block other markers.
- If a known unreadable marker starts the input, Pi may also emit its native read
  diagnostic because the current input API cannot suppress that fallback without
  changing the message. The package does not rewrite or asynchronously resend it.
- Markers inside Markdown code spans or fences still expand unless escaped.
- Inserted skill bodies are not scanned recursively, and markers do not accept
  per-skill arguments. All remaining text is shared by every selected skill.
- The package adds no file watcher or custom scan roots and does not affect SDK
  `steer()` or `followUp()` calls that bypass Pi's input hook.
