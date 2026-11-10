# @kxh4892636/pi-toolkit

One [pi](https://pi.dev) extension bundling this workspace's five pi tools, each behind a
switch in a single JSON file:

| Tool              | Switch         | What it enables                                                                       |
| ----------------- | -------------- | ------------------------------------------------------------------------------------- |
| `nested-skill`    | `nestedSkills` | Nested `SKILL.md` discovery, `$skill-name` completion, and `$` reference expansion.   |
| `session-name`    | `sessionName`  | Automatic session naming from the first user input.                                   |
| `pi-deepseek-web` | `webTools`     | The `web_search` and `web_fetch` model tools (DeepSeek official Search/Fetch APIs).   |
| `ask_questions`   | `askQuestions` | One or more blocking questions to the user, with options, custom answers, or skips.   |
| `nano-flow`       | `nanoFlow`     | Prompted Plan workflow: plan tools, per-session skills, notes sidebar, context reset. |

**Every switch starts off.** Nothing is registered as active, discovered, expanded, or named until
you turn it on.

## Install

```bash
pi install /absolute/path/to/packages/pi-toolkit
```

The package ships TypeScript and is loaded by pi's jiti loader; no build step is needed. The pi SDK,
pi-tui, and typebox are peer dependencies.

## `/toolkit`

Run `/toolkit` to open a switch panel modeled on pi's own `/settings` screen: a bordered, searchable
`SettingsList` listing the five tools in panel order (`nested-skill`, `session-name`,
`pi-deepseek-web`, `ask_questions`, `nano-flow`). Up/Down move, Enter/Space flips a switch, Esc closes, typing filters.

- `nestedSkills` covers discovery, completion, and expansion. Completion and expansion apply on the
  next input; discovery runs at startup and on `/reload`, so turning it on takes effect there.
- `sessionName` applies on the next input.
- `webTools` and `askQuestions` apply immediately: the tools are added to or removed from the active
  tool set, and each call re-checks the switch.
- `nanoFlow` gates the Nano Flow feature; the per-session mode is switched with `/nano-flow`. See
  [Nano Flow](#nano-flow).

Switch changes are written back to the config file named in the panel header (see precedence below),
preserving every other key in that file.

## Configuration

Everything lives in one JSON file — switches and tunables alike. There is no separate settings
screen for the values; edit the file.

```json
{
  "tools": {
    "nestedSkills": false,
    "sessionName": false,
    "webTools": false,
    "askQuestions": false,
    "nanoFlow": false
  },
  "web": {
    "apiKey": "sk-...",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "baseURL": "https://api.deepseek.com",
    "searchCount": 10,
    "searchMaxQueries": 10,
    "searchMaxResults": 10,
    "searchSummaryMaxChars": 800,
    "searchTimeoutMs": 30000,
    "fetchTimeoutMs": 30000,
    "fetchMaxOutputChars": 200000
  },
  "nestedSkill": {
    "excludedDirs": ["node_modules", ".git", "dist", "build", "coverage", "out"]
  },
  "sessionName": {
    "maxLength": 21,
    "timeoutMs": 5000,
    "maxTokens": 256
  },
  "nanoFlow": {
    "always": false,
    "specMaxBytes": 34816,
    "noteMaxBytes": 13312,
    "noteDescriptionMaxChars": 233,
    "contextMaxBytes": 91136,
    "questionMaxBytes": 13312,
    "adrMaxBytes": 8192,
    "workflowMaxBytes": 34816,
    "guideMaxBytes": 13312,
    "rotateAt": 0.618
  }
}
```

Precedence (low to high): `~/.pi/agent/pi-toolkit.json`, `<cwd>/.pi/pi-toolkit.json`,
`$PI_TOOLKIT_CONFIG` (an explicit file path). Sections merge field by field, so a project file can
override one tunable without restating the rest. A project `.pi` config is ignored when the project
is untrusted. Unknown keys are ignored so a stale field never breaks a launch.

`/toolkit` writes switches to the highest-precedence file that already exists; when none exists it
creates `~/.pi/agent/pi-toolkit.json`. `pi-toolkit.example.json` shows every field.

### `tools`

| Key            | Default | Meaning                                                                           |
| -------------- | ------- | --------------------------------------------------------------------------------- |
| `nestedSkills` | `false` | Discover hidden nested skills, complete `$skill-name`, and expand `$` references. |
| `sessionName`  | `false` | Name each session from its first input.                                           |
| `webTools`     | `false` | Enable the `web_search` and `web_fetch` tools.                                    |
| `askQuestions` | `false` | Enable the `ask_questions` tool.                                                  |
| `nanoFlow`     | `false` | Enable the Nano Flow feature (per-session via `/nano-flow`).                      |

### `web`

| Field                   | Default                    | Meaning                                                |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| `apiKey`                | —                          | Literal DeepSeek API key.                              |
| `apiKeyEnv`             | `DEEPSEEK_API_KEY`         | Env var read when `apiKey` is absent.                  |
| `baseURL`               | `https://api.deepseek.com` | API root; a trailing `/v1` is also accepted.           |
| `searchCount`           | `10`                       | Results requested per Search request (1–50).           |
| `searchMaxQueries`      | `10`                       | Most queries accepted by one `web_search` call.        |
| `searchMaxResults`      | `10`                       | Most merged sources returned by one `web_search` call. |
| `searchSummaryMaxChars` | `800`                      | Per-source summary cap, including the ellipsis.        |
| `searchTimeoutMs`       | `30000`                    | Timeout for one Search request.                        |
| `fetchTimeoutMs`        | `30000`                    | Timeout for one Fetch request.                         |
| `fetchMaxOutputChars`   | `200000`                   | Cap on the complete rendered `web_fetch` output.       |

The API key resolution order is `web.apiKey` > the environment variable named by `web.apiKeyEnv`.

`baseURL` must be an absolute `http(s)` URL without query/fragment. The legacy Anthropic endpoint
(`.../anthropic/v1`) is rejected with an actionable error; point `baseURL` at the API root instead.

### `nestedSkill`

| Field          | Default                                                    | Meaning                                                                     |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `excludedDirs` | `node_modules`, `.git`, `dist`, `build`, `coverage`, `out` | Directory names pruned from the walk. Dot-prefixed names are always pruned. |

### `sessionName`

| Field       | Default | Meaning                                     |
| ----------- | ------- | ------------------------------------------- |
| `maxLength` | `21`    | Maximum name length in Unicode code points. |
| `timeoutMs` | `5000`  | Timeout for the naming model request.       |
| `maxTokens` | `256`   | Token budget for the naming request.        |

## Ask questions (`ask_questions`)

With `askQuestions` on, the model can put one or more questions to you and wait for the answers
before continuing. Each question offers up to 3 model-provided options (each with an optional
one-line description): pick one, type a custom answer, or skip.

In the TUI one component manages every question: `←/→` or `Tab/Shift+Tab` switch questions and
restore each one's previous selection; the page after the last question is a separate **Submit**
page that summarizes every answer. A question counts as handled only when it was answered or
explicitly skipped; submitting with unanswered questions jumps to the first one and names the rest.
Confirming "custom answer" leaves the component, takes the text with `ctx.ui.input`, then re-enters
with the same draft; empty input stays on the question, Esc keeps the existing answer. `rpc` and
`print` fall back to sequential `ctx.ui.select` prompts without back-navigation.

The tool is `executionMode: "sequential"`, so it never overlaps another tool call. When no
interactive UI is available it does not throw: it returns a structured `needs=answer` registration
so the caller knows the question was not answered.

## Nano Flow

`nanoFlow` is a fifth switch. It gates the whole workflow; the current session still has to be
turned on with `/nano-flow`, which mirrors `/thinking`: a two-item list, Enter changes this session,
`Ctrl+S` also writes the new-session default. `/nano-flow bind [plan]` binds the current session
directly; without a plan name it uses the only active Plan (and refuses when there are several).

- **Prompts**: `src/nano-flow/prompts/system.md`, the `.agents/domains/GUIDE.md` snapshot, and the
  numeric limits block are injected as the `nano-flow` system-prompt section. A per-input reminder
  is injected as a hidden custom message.
- **Tools**: `nano_flow_create`, `nano_flow_bind`, `nano_flow_check`. `create` scaffolds domains,
  plans, and notes from templates; `bind` is the only binding entry; `check` validates docs,
  regenerates every index, and auto-fixes the mechanical problems it can settle from existing facts
  (`scripts/check-domain.mjs`, imported directly, no subprocess). Auto-fixed today: spec status
  derived from notes, `name` aligned to the file name (with `related_noted` references rewritten),
  `reason` dropped on non-blocked notes, multi-line header fields folded to one line, and a missing
  `questions/` directory created. Everything else — sizes, duplicate names, structure, related-link
  targets — is still only reported.
- **Binding**: `nano-flow-binding` custom entries in the session; the last one wins, so resuming a
  session keeps its Plan without a global table.
- **Context reset**: when `tokens / contextWindow >= rotateAt` on a user input, the extension
  appends a `nano-flow-reset` entry and the `context` hook drops older messages, prepending a seed
  with the current Plan and the previous assistant output (`<rotation-last-output>`). The session
  JSONL keeps the full history; this session is not replaced.
- **Compaction disabled while active**: the reset above is a `context`-level filter, so pi's own
  compaction would summarize the pre-reset history and hand it back. While the session is in Nano
  Flow, `session_before_compact` returns `{ cancel: true }` for `manual` (`/compact`), `threshold`
  and `overflow` alike. Turning Nano Flow off restores pi's normal compaction.
- **Notes sidebar**: fullscreen-only overlay in the top-right, always mounted once a Plan is bound.
  It lists the unfinished notes of the bound Plan (`pending` / `in_progress` / `blocked`) and keeps
  the frame with a dim `全部完成` line when the list is empty; click a row for a card with the
  description, `原因：`, and `下一步：`. The border-colored `▤` glyph at the top-right corner (its own
  one-column overlay, sharing the top border row so the glyph takes the `┐` cell) collapses the whole
  block to just that glyph. It refreshes once at `turn_end`, and that refresh is a no-op while the
  sidebar is not mounted.
- **Skills**: `ask`, `do`, `to-skill`, `code-spec`, `learning`, `ponytail-review`,
  `ponytail-audit` are contributed through `resources_discover` only while the session is in Nano
  Flow. Turning it on mid-session needs `/reload` (or a new session) for the skills to appear.
- **Plan trace**: at `agent_start` the extension remembers the session leaf entry, and at
  `agent_end` it appends one `<plan>/log.jsonl` record (`type: "run"`) holding a verbatim copy of
  the entries that run produced. Only increments are written; the file is covered by the root
  `.gitignore` (`**/plans/**/log.jsonl`).
- **`/dream`**: runs one memory-maintenance pass over `.agents/domains/*`. Each domain contributes
  its newest `dreamMaxPlansPerDomain` plans from `active` + `reference` (dated directory names,
  newest first). It refuses when the switch is off, the session is not in Nano Flow, the agent is
  busy, or the worktree is dirty, then sends `prompts/dream.md` plus the plan manifest as a user
  message. The model runs the five passes, calls `nano_flow_check`, and commits `docs(dream): …`.

### `nanoFlow`

| Field                     | Default | Meaning                                              |
| ------------------------- | ------- | ---------------------------------------------------- |
| `always`                  | `false` | Start new sessions in Nano Flow.                     |
| `specMaxBytes`            | `34816` | `spec.md` size cap.                                  |
| `noteMaxBytes`            | `13312` | One note size cap.                                   |
| `noteDescriptionMaxChars` | `233`   | `description` length cap.                            |
| `contextMaxBytes`         | `91136` | `CONTEXT.md` size cap.                               |
| `questionMaxBytes`        | `13312` | One question size cap.                               |
| `adrMaxBytes`             | `8192`  | One ADR size cap.                                    |
| `workflowMaxBytes`        | `34816` | One workflow size cap.                               |
| `guideMaxBytes`           | `13312` | `GUIDE.md` size cap.                                 |
| `rotateAt`                | `0.618` | Context ratio that triggers the history reset (0–1). |
| `dreamMaxPlansPerDomain`  | `21`    | Plans per domain considered by `/dream`.             |

## Web tools (`pi-deepseek-web`)

Both tools follow the toolkit's portable web contract and are backed only by DeepSeek's official
[Search and Fetch APIs](https://api-docs.deepseek.com/zh-cn/guides/search):

- **`web_search`** — `POST /v1/tools/search`. The only model argument is `queries: string[]`; their
  results are merged. Search is discovery only: titles, URLs, snippets/summaries and dates, never
  page bodies.
- **`web_fetch`** — `POST /v1/tools/fetch`. The only model argument is `url`. The result is the page
  Markdown, capped at `fetchMaxOutputChars`.

There is no Anthropic Messages call, model turn, turndown conversion, or direct HTTP fetch.

Each Search request sends `count = min(searchCount, searchMaxResults)`, `need_content: false`, and
the latest user message as `ori_question` (whitespace collapsed, capped at 128 characters). The
model never controls these fields. Queries are validated (at least one, at most `searchMaxQueries`,
non-blank, exact duplicates collapsed), run concurrently, merged round-robin, deduplicated by URL,
and capped at `searchMaxResults`; anything dropped is reported as `truncated`.

Search operators (`site:`, `-site:`, `-`, `-"..."`, `"..."`, `lang:`, `after:`, `before:`) are
passed through to DeepSeek's service.

`web_fetch` accepts one absolute HTTP(S) URL, up to 8192 characters, with a host and without a
username or password. Its `details` are `{ url, statusCode, body: { kind: "text", content },
truncated }`; the DeepSeek Fetch API reports neither the target status nor a title, so a success is
modeled as HTTP 200 and the requested URL.

DeepSeek rate-limits Search (100 QPS) and Fetch (25 QPS) per account and bills successful requests.
The tools do not retry automatically: HTTP 408/429/5xx can be retried after a wait, HTTP 402 means
the account needs a top-up, other 4xx errors should be fixed before retrying, and `web_fetch`
returns 403 when the target is refused by the safety policy.

## Command Code provider (`commandcode`)

A provider for the [Command Code](https://commandcode.ai) gateway, always registered; it exposes no
tool, and stays unavailable in `/model` until you run `/login commandcode` (the credential lives in
`~/.pi/agent/auth.json`, never in the JSON config).

- **DeepSeek only**: the gateway's catalog is filtered to the `deepseek` vendor, so the seven DeepSeek
  models are the only ones listed. A snapshot persisted by an older version still names other
  vendors; it is filtered on restore, and a model you had selected from another vendor disappears
  from `/model` — pick a DeepSeek model once after upgrading.
- **Thinking, with effort levels**: every listed model is marked as a thinking model, with pi's
  thinking levels mapped onto DeepSeek's `reasoning_effort` (`off` → `off`, `minimal`/`low` → `low`,
  `medium`/`high`/`xhigh` → `high`, `max` → `max`). Only that standard OpenAI field is sent: the
  gateway validates it against `off|low|medium|high|xhigh|max` and rejects anything else with a 400
  naming the parameter. The DeepSeek-native `thinking` switch is _not_ sent — the gateway accepts it
  but ignores it, so a `thinking: disabled` request still reasons.
- **Text and image input** on every model. The vendor's model table only says "with vision" for
  `deepseek/deepseek-v4-flash-vision-exp` and `deepseek/deepseek-v4.1-flash`, so an image sent to one
  of the others may be refused upstream.
- `requiresReasoningContentOnAssistantMessages` is set: DeepSeek documents a 400 when a replayed
  assistant turn drops `reasoning_content` while tools are in the request. (Measured on this
  gateway: a replay without it was accepted, so the flag is belt-and-braces rather than required.)

The catalog comes from `https://api.commandcode.ai/provider/v1/models` and the per-model rates from
the pricing page; a failed catalog keeps the last good list, and a failed pricing page only costs the
cost estimate. See [DeepSeek's thinking-mode guide](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode).

## Nested skills and `$` references

pi's skill scanner stops descending as soon as a directory contains `SKILL.md`, so a `SKILL.md` under
another skill directory (for example `.agents/skills/nano-flow/references/skills/questing/SKILL.md`)
is invisible. With `nestedSkills` on, those hidden skills are contributed through
`resources_discover`, scanning the agent skills dir, the user `~/.agents/skills` dir, project
`.pi/skills` / `.agents/skills` (trusted projects only), and the directories of skills pi already
knows about. Newly added or renamed nested skills are picked up on the next `resources_discover`
(startup or `/reload`).

With `nestedSkills` on, typing `$` anywhere in the input box opens a fuzzy-ranked skill picker;
the pick inserts `$skill-name `. Every `$name` that resolves to a skill is replaced on submit with
the same `<skill name location>` block pi uses for `/skill:name`. Several references per message
work, and unknown tokens such as `$HOME` are left untouched.

## Session naming

With `sessionName` on, the first user input of a session produces a short title through the session's
current model, stored with `pi.setSessionName()` (the API behind `/name`). Invoked skills are
filtered out first — expanded `<skill …>` blocks and a leading `/skill:<name>` command — so the title
reflects the user's request; a bare invocation is named after the skill. When there is no model, no
configured auth, the request fails, or the reply has no usable text, it falls back to a deterministic
truncation of the filtered input. Names are cleaned of markdown markers, quotes, labels (`标题:` /
`title:`) and trailing punctuation, then truncated to `maxLength`. Naming is fire-and-forget: the
`input` handler returns immediately, and a name set manually while the model call is in flight is
never overwritten.

## Development

```bash
pnpm --filter @kxh4892636/pi-toolkit test
pnpm --filter @kxh4892636/pi-toolkit test:coverage
pnpm --filter @kxh4892636/pi-toolkit check
```
