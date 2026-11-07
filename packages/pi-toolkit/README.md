# @kxh4892636/pi-toolkit

One [pi](https://pi.dev) extension bundling this workspace's four pi capabilities, each behind a
switch in a single JSON file:

| Switch         | What it enables                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| `webTools`     | The `web_search` and `web_fetch` model tools (DeepSeek official Search/Fetch APIs). |
| `nestedSkills` | Nested `SKILL.md` discovery, `$skill-name` completion, and `$` reference expansion. |
| `sessionName`  | Automatic session naming from the first user input.                                 |
| `nanoFlow`     | The Nano Flow Plan/DAG workflow: fixed prompt, `nano_flow_*` tools, bundled skills. |

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
`SettingsList`. Up/Down move, Enter/Space flips a switch, Esc closes, typing filters.

- `webTools` applies immediately: both tools are added to or removed from the active tool set, and
  each call re-checks the switch.
- `sessionName` applies on the next input.
- `nestedSkills` covers discovery, completion, and expansion. Completion and expansion apply on the
  next input; discovery runs at startup and on `/reload`, so turning it on takes effect there.
- `nanoFlow` makes the Nano Flow command, tools and skills available; run `/nano-flow` to choose
  whether the current session (or every new session) runs it. Skill discovery needs `/reload`.

Switch changes are written back to the config file named in the panel header (see precedence below),
preserving every other key in that file.

## Configuration

Everything lives in one JSON file — switches and tunables alike. There is no separate settings
screen for the values; edit the file.

```json
{
  "tools": {
    "webTools": false,
    "nestedSkills": false,
    "sessionName": false,
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
    "storyMaxBytes": 34816,
    "specMaxBytes": 34816,
    "noteMaxBytes": 13312,
    "noteDescriptionMaxChars": 144,
    "indexMaxRows": 13,
    "contextMaxBytes": 91136,
    "questionsMaxBytes": 91136,
    "adrMaxBytes": 13312,
    "adrMaxCount": 55,
    "rotateAt": 0.618,
    "always": false
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

| Key            | Default | Meaning                                                                                  |
| -------------- | ------- | ---------------------------------------------------------------------------------------- |
| `webTools`     | `false` | Enable the `web_search` and `web_fetch` tools.                                           |
| `nestedSkills` | `false` | Discover hidden nested skills, complete `$skill-name`, and expand `$` references.        |
| `sessionName`  | `false` | Name each session from its first input.                                                  |
| `nanoFlow`     | `false` | Expose `/nano-flow`, the three `nano_flow_*` tools, `ask_questions`, and bundled skills. |

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

### `nanoFlow`

| Field                     | Default | Meaning                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------- |
| `storyMaxBytes`           | `34816` | `story.md` size cap.                                                |
| `specMaxBytes`            | `34816` | `spec.md` size cap.                                                 |
| `noteMaxBytes`            | `13312` | One note body cap.                                                  |
| `noteDescriptionMaxChars` | `144`   | Note summary length cap.                                            |
| `indexMaxRows`            | `13`    | Key-index row cap.                                                  |
| `contextMaxBytes`         | `91136` | Domain `CONTEXT.md` size cap.                                       |
| `questionsMaxBytes`       | `91136` | Domain `QUESTIONS.md` size cap.                                     |
| `adrMaxBytes`             | `13312` | One ADR size cap.                                                   |
| `adrMaxCount`             | `55`    | ADRs per domain.                                                    |
| `rotateAt`                | `0.618` | Context-window ratio that clears the session and restores the Plan. |
| `always`                  | `false` | New sessions start in Nano Flow (a per-session choice wins).        |

## Web tools

Both tools follow the DeepSeek Harness `tool-web` contract and are backed only by DeepSeek's official
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

## Nano Flow

Turn on `nanoFlow`, then run `/nano-flow`. The selector mirrors `/thinking`: it lists only `开` and
`关` (the current session value is checked), Enter changes the current session, and `Ctrl+S` also
sets the value as the default for new sessions (`nanoFlow.always`). The default entry is marked with
`· default`.

`/nano-flow status` prints the current mode and every active Plan with its note counts. There is no
panel; the tools and the command are the query surface. `--nano-flow` starts a session enabled.

While a session runs Nano Flow:

- The fixed prompt in `prompt.md` is added as the `nano_flow` system-prompt section.
- `nano_flow_read` (plans / notes / get / ready / graph / index / search / resume),
  `nano_flow_write` (init / create / update / link / status / complete / set_index / merge / delete /
  move), `nano_flow_check` (plan / workspace / limits) and `ask_questions` are active.
- `ask_questions` asks any number of questions; each one offers model-provided options plus a custom
  answer and a skip action.
- pi's automatic compaction is disabled. When context usage reaches `rotateAt`, the next input
  replaces the conversation with a resume seed plus that input; the Plan on disk is the state.
- Non-`nano_flow_*` tools are blocked from touching `notes.json` (policy, not a security boundary).
- The bundled skills (`ask`, `do`, `code-spec`, `kaizen`, `learning`, `to-skill`) are contributed
  through `resources_discover` when the switch is on; `/reload` makes them visible.

## Development

```bash
pnpm --filter @kxh4892636/pi-toolkit test
pnpm --filter @kxh4892636/pi-toolkit test:coverage
pnpm --filter @kxh4892636/pi-toolkit check
```
