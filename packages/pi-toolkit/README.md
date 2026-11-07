# @kxh4892636/pi-toolkit

One [pi](https://pi.dev) extension bundling this workspace's four pi capabilities, each behind a
switch in a single JSON file:

| Switch         | What it enables                                                                           |
| -------------- | ----------------------------------------------------------------------------------------- |
| `webTools`     | The `web_search` and `web_fetch` model tools (DeepSeek official Search/Fetch APIs).       |
| `nestedSkills` | Nested `SKILL.md` discovery, `$skill-name` completion, and `$` reference expansion.       |
| `sessionName`  | Automatic session naming from the first user input.                                       |
| `orchestrator` | The Orchestrator Plan/DAG workflow: fixed prompt, `orchestrator_*` tools, bundled skills. |

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
- `orchestrator` makes the Orchestrator command, tools and skills available; run `/orchestrator` to choose
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
    "orchestrator": false
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
  "orchestrator": {
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

| Key            | Default | Meaning                                                                                        |
| -------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `webTools`     | `false` | Enable the `web_search` and `web_fetch` tools.                                                 |
| `nestedSkills` | `false` | Discover hidden nested skills, complete `$skill-name`, and expand `$` references.              |
| `sessionName`  | `false` | Name each session from its first input.                                                        |
| `orchestrator` | `false` | Expose `/orchestrator`, the three `orchestrator_*` tools, `ask_questions`, and bundled skills. |

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

### `orchestrator`

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
| `always`                  | `false` | New sessions start in Orchestrator (a per-session choice wins).     |

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
another skill directory (for example `.agents/skills/orchestrator/references/skills/questing/SKILL.md`)
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

## Orchestrator

Turn on `orchestrator`, then run `/orchestrator`. The selector mirrors `/thinking`: it lists only `开` and
`关` (the current session value is checked), Enter changes the current session, and `Ctrl+S` also
sets the value as the default for new sessions (`orchestrator.always`). The default entry is marked with
`· default`.

`/orchestrator status` prints the current mode and every active Plan with its note counts. There is no
panel; the tools and the command are the query surface. `--orchestrator` starts a session enabled.

While a session runs Orchestrator:

- The fixed prompt in `prompt.md` is added as the `orchestrator` system-prompt section.
- The orchestrator only triages and relays: it decides which plan an input belongs to, dispatches the
  plan's worker, and presents the worker's report plus note evidence for the user to confirm. Code
  research, implementation, tests and review belong to workers; `prompt.md` fixes the action whitelist
  (`orchestrator_read` / `write` / `check` / `dispatch` / `workers` / `ask_questions`) and the
  existing-vs-new-worker rule.
- `orchestrator_read` (plans / notes / get / ready / graph / index / search / resume),
  `orchestrator_write` (init / create / update / link / status / complete / set_index / merge / delete /
  move), `orchestrator_check` (plan / workspace / limits), `orchestrator_dispatch` (start or message the
  worker of one plan) and `orchestrator_workers` (list or abort live workers) are the **entire** active
  tool set, together with `ask_questions`. The host's `read` / `bash` / `edit` / `write` / web tools are
  switched off in that session, so evidence has to come from a worker. Leaving the mode (`/orchestrator
关`, `always: false`, or the `/toolkit` switch off) restores the **config-layer** default set: the
  `defaultTools` setting with `--tools` semantics (plain names replace it, `+name` / `-name` apply on top),
  unioned with the active set recorded in the `orchestrator-baseline` session entry before the first
  convergence and with whatever another switch has (re)activated, e.g. web tools. It never snapshots
  `getActiveTools()` at restore time: pi records the tool loadout in the transcript and `/reload` plus
  resumed sessions replay it, so a snapshot taken after converging is the converged set itself and the
  host tools would never come back. The `orchestrator-baseline` entry is written once per branch and read
  back after a reload. `disposeAll` (session shutdown / reload) writes the plans it kills and their
  `in_progress` notes into the interrupted.json record before dropping the workers, so no note is left
  silently dangling. The tool set is re-aligned on every `before_agent_start` as well, before the mode
  check: a reload or resume path that does not replay `session_start` is then corrected by the next
  request instead of leaving the session converged with the host tools missing.
- `status` takes `pending / in_progress / waiting / blocked`; `waiting` must say what it waits for via
  `needs: "answer" | "review"`, and `complete` only accepts `waiting` + `needs=review`. Old
  `awaiting_verification` documents are read as `waiting` + `needs=review`.
- `ask_questions` asks any number of questions; each one offers at most 3 model-provided options (each
  with an optional one-line description), a custom answer and a skip. In the TUI one component drives
  **all** questions: `←/→` (or `Tab/Shift+Tab`) moves between them and each question keeps its own
  selection, so going back re-opens the earlier answer for editing; `Enter` advances and submits on the
  last question, and a `提交` entry ends the run early. Submitting is refused while any question is still
  untouched: the cursor jumps to the first one and the message names the rest (an explicit skip is
  `skipped: true` and does count as handled). Picking a custom answer leaves the component for
  `ctx.ui.input` and re-enters on the same question with the earlier answers intact. It renders its own
  list — two lines per option, a blank line between options — because the host `SelectList` keeps the
  description on the same line and has no item gap; `rpc` / `print` fall back to `ctx.ui.select`,
  question after question, with the description appended to the label (no back-navigation there).
- pi's automatic compaction is disabled. When context usage reaches `rotateAt`, the next input
  replaces the conversation with a resume seed plus that input; the Plan on disk is the state.
- Non-`orchestrator_*` tools are blocked from touching `notes.json` (policy, not a security boundary).
- **Sidebar (TUI only).** While the mode is on, a `▤` icon sits in the top-right corner and toggles a
  40-column right-anchored overlay (`sidebar.ts`). The list is **three levels — Plan → worker group →
  note** — with no summary line at the top, drawn as a tree: the Plan row is unadorned, its children use
  `├─` / `└─` (the last child of each level is always `└─`) and continue with `│  ` while the parent still
  has siblings below.

  ```
  pi多plan编排
  ├─ worker: notes 43
  │  ├─ 执行中 · 43 侧栏改版…
  │  └─ 已完成 · 42 下行 ack…
  ├─ worker: plan
  │  └─ 执行中 · 39 worktree 派工
  └─ 已完成 3 条 ▸
  ```

  Group labels come from the registry entry: `worker: notes 38,42` when the worker holds specific notes
  (one row per group, so a Plan with several workers lists several groups), `worker: plan` for a
  plan-level dispatch (`notes: []`), and `未分组` for notes nobody holds. A note row is
  `待验收 · 42 下行 ack` — the Chinese status name (`执行中` / `待回答` / `待验收` / `阻塞` / `待开工` /
  `已完成`) plus id and title, never the description; the description lives in the detail card only.
  Completed notes are folded into the Plan's last branch (`└─ 已完成 N 条 ▸`); expanding it puts each one
  back under its own group.

  **Line spacing is carried by the tree connectors, not by blank rows**: no empty line between groups or
  between notes; only between two Plans. Styling is colour-only — running rows use `accent`, everything
  else is default/bold. There is deliberately **no `dim`** anywhere in the list: a terminal has no font
  size, so dimming would be faking a smaller font rather than expressing hierarchy.

  Clicking a note opens the detail card: a `warning`-framed box headed `◇ note <id> · <状态>` carrying
  the snapshot (description, blocking reason, group, Plan) and, while a worker holds that note, a
  200ms-throttled live stream of its text deltas and tool calls. **The card is the whole overlay** —
  `width: DETAIL_WIDTH`, `anchor: "center"`, `nonCapturing` — so everything outside it is genuinely
  transparent (the transcript and the sidebar stay visible). That is a host constraint, not a
  preference: `compositeTuiLine` writes `overlayWidth` columns for _every_ rendered overlay line, so a
  returned `""` blanks that row rather than leaving it alone; only shrinking the overlay rectangle to
  the card leaves the rest untouched. The price is that clicks outside the card reach the components
  underneath, so there is no click-outside-to-dismiss: close with the `×` in the card's top-right
  corner or with `Esc`. `Esc` is consumed by the sidebar's `addInputListener` (the card never takes
  keyboard focus) and closes **only** the detail — the sidebar stays until you click `▤` again. The
  list itself re-reads the plans every 3s (only when the rows actually change is a render requested) —
  the stream keeps its own, independent 200ms cadence.

  Plans are filtered by **domain**, not by "has a live worker": `orchestration` is skipped because that
  Plan is the orchestrator's own progress board and never produces worker deliverables, whereas a
  "live worker" test would make whole Plans flicker in and out as workers start and finish.

  Both layers are framed and visually distinct: the sidebar is a 40-column box in the `accent` colour with
  the title `▤ Note 状态`, pinned to the **top-right** corner (`anchor: "top-right"`, margin 1 on the right
  and bottom, one extra row on top for the icon), while the detail card is framed in `warning` and headed
  `◇ note <id>` — neither uses the body text colour, so it is obvious which layer you are looking at. The
  `▤` icon is its own one-line overlay but derives its columns from the sidebar's: both share the same right
  margin, so `iconColumns(term).right === sidebarColumns(term).right` and the icon sits exactly on the
  sidebar's top row, like a tab on the panel. The 40 is the _component_ width handed to `render()`: the host
  adds no frame of its own, so borders and padding live inside those 40 columns (36 usable for text) and
  the panel occupies 42 screen columns once the side gaps are counted. Long note titles are truncated in
  the **title only**, with an ellipsis: `执行中 · 43 侧栏改版：去汇总 …` — the status name and the note id
  are always shown in full.

  Three things were verified rather than assumed: a `nonCapturing` overlay **does** receive mouse clicks
  (hit-testing is geometric; only focus acquisition respects the flag), so the sidebar neither steals
  focus nor needs a keyboard fallback; mouse input only exists in fullscreen (alt-screen) mode, and in
  `regular` mode an overlay's rows can scroll into the scrollback where they can no longer be repainted —
  so both the icon and the sidebar are shown **only when `tui.mode === "fullscreen"`** (pi's default);
  below 110 columns the sidebar hides itself while the icon stays put and answers a click with a
  notification explaining the width requirement. The threshold moved with the width: 42 screen columns
  out of 100 would leave the transcript only 58, so 110 keeps it at 68 — the same ratio the old
  32-column panel had at 100 columns.

- The bundled skills (`ask`, `do`, `code-spec`, `kaizen`, `learning`, `to-skill`) are contributed
  through `resources_discover` when the switch is on; `/reload` makes them visible.

### Workers

The worker keeps `orchestrator_check` for self-checking: `op: "plan"` validates its own plan,
`op: "limits"` reports the limits, and `op: "workspace"` is scoped to `common` plus its own domain —
the same set it may write. The orchestrator's `op: "workspace"` covers every domain.

`orchestrator_dispatch` starts one worker per **group of notes** with the SDK's `createAgentSession` (in
process, no extension discovery, only the worker extension). Both plan workers and temporary workers keep
their conversation as a **jsonl session on disk**, and the session id is the hash of the work key
(`<plan dir>::<group>` or `temp:<id>`), so the mapping is rebuildable from disk alone; a small
`workers.json` in the state dir only speeds up lookup and records voided keys. Dispatch resolves a worker
by **live handle → disk session → new**: the same group picks up its previous context after a restart,
while nothing is reattached at startup. `abort` (or a watchdog timeout) voids the key: a temporary id can
never be dispatched again (pick a new one) and a plan/group key moves to a fresh generation (the old jsonl
stays as history). The tool result carries the `sessionPath` so the orchestrator knows where the history
lives. `worker:plan` is 1:N: a plan can run several
workers at once, one group (a set of notes with no `blocked_by` between them) each; the same group reuses
its session and queues the message as a follow-up, a different group gets its own. Dispatch with neither
`plan` nor a locked plan starts a **temporary worker** instead — no plan, read-only tools + report, dropped
as soon as it settles. Dispatch does **not** wait for the run: it
returns a `plan` / `notes` / `kind` / `note` / `started` / `queued` / `delivery` / `delivered` summary as
soon as the input is enqueued, so several plans can be dispatched back to back. `delivery` is orthogonal to
`kind`: `queue` (the default) appends the input as a `followUp` that is digested after the worker's current
turn, while `steer` calls `session.steer()` so the new direction is in place before the worker's next LLM
call — use it for "wrong direction" or "don't touch that file", not for ordinary messages. `steer` on an
idle worker has no running turn to steer into and degrades to `prompt()`; the result then reports
`delivered: "prompt"`. `nextTurn` is never used (it is not persisted and dies with the process). There is no
`abort` argument: to hard-stop a worker use `orchestrator_workers`'s abort and dispatch again.

**Worktrees** (`worktree.ts`): `worktree: true` (auto name `note-<id>` / `grp-<id-id>` / `plan`) or a name
puts the worker's cwd in `.worktrees/<名字>` on branch `wt/<名字>` and runs `pnpm install --prefer-offline`
there first — one install per worktree, as measured on Windows with a warm store: worktree add ≈1.5s /
98 MB, install ≈13.5s, `node_modules` 894 MB nominal but ≈183 MB of real disk (pnpm hardlinks its store),
and `pnpm test` then runs in 3.8s (372 tests). A failed install aborts the dispatch with the reason instead
of letting the worker skip tests. The plan stays anchored to the main workspace (absolute path), so
`notes.json` still has exactly one writer. The worker must rebase onto the latest main commit and report
"ready for `--ff-only` merge"; a conflicting rebase becomes `blocked` with the scene left intact. Merging
and cleanup are a separate dispatch (`git merge --ff-only wt/<名字>`, then
`git -c core.longpaths=true worktree remove` with an `rm -rf` fallback and `worktree prune`, then delete the
branch) — `abort` and timeouts never delete a worktree. Each worker
records its most recent input (`WorkerEntry.lastInput`: kind, delivery, summary, time), which
`orchestrator_workers` prints per line next to the start time and the last report. Every delivery also lands in
a 20-entry ledger (`WorkerEntry.inputLog`), so the list separates **still pending** from **already consumed**:
`输入 N 次` stays a cumulative counter (it only grows), while `待消费 N（最老 X）` is the queue.
Consumption is inferred from session events, not from the model: `queue_update` reports the follow-up / steering
queues, and a shrinking queue means the host spliced that message into the running turn — exact, because both
queues are FIFO, so the oldest unconsumed record of that branch is the one consumed. An idle delivery
(`prompt` / degenerate `steer`) is consumed at `agent_start`. If a session never emits `queue_update` (older
session object, or no `subscribe`), the ledger degrades to "one `agent_start` consumes the oldest unconsumed
record", which is an **approximation** — it keeps the count right but cannot tell which input was consumed.
`待消费` older than a fixed 10 minutes (`INPUT_STUCK_MS`, independent of `workerTimeoutMs`) adds
`⚠ 可能卡住`. `pass` / `rework` / `answer` with a `note` route to the group
that owns it; a note no group owns is an error, never a guess. `notes.json` writes are serialized per path
inside the process (workers and the orchestrator share one pi process); two pi instances writing the same
plan are out of scope. The turn's terminal state is the enqueued input's promise
(`prompt()`, or `followUp()` then `waitForIdle()`), which harvests the job. A background watchdog measures
**time without progress**: every `orchestrator_report` from that worker renews it, so a long task just has to
report periodically (every 10–15 minutes). On `orchestrator.workerTimeoutMs` of silence the watchdog aborts
the session, drops its handle (the next dispatch starts a fresh worker) and injects one
`orchestrator-worker-timeout` message, without touching note state. The worker can do every note-level action but
cannot `init` a plan, cannot `move` it, and cannot write `completed` — it reports the note as
`waiting(needs=review)` with `orchestrator_report`, and only after the orchestrator sends `pass` may it
complete. The worker has no `ask_questions`: a question becomes `orchestrator_report(needs_answer)`.
Every finished note is committed right away (`git add -A && git commit`, message starting with the note
id) and the hash goes into that note's evidence: the orchestrator has no `bash`, so it cannot commit, and
nothing is committed while tests or checks fail.

`orchestrator_report` arrives in the orchestrator session as an `orchestrator-report` message. Reports
are notifications; the notes on disk are the truth. Delivery goes through an **outbox**: `pi.sendMessage`
is fire-and-forget (failures are swallowed by the host), so the plugin keeps its own account — a failed
injection is queued and counted, retried on the next `agent_settled` / `before_agent_start` / `input`, and
removed once it lands. Busy orchestrator → `deliverAs: "followUp"`; idle → `steer` + `triggerTurn`. Pending
count and the last error show up in `orchestrator_workers` and `/orchestrator status`, and a retry never
touches note state. The backlog is also **persisted** to `reports-pending.json` in the state dir (ids are
deduplicated, the file is rewritten on every change and deleted once the queue drains), so an undelivered
report survives a crash or a restart and is retried by the first hook of the next session.

A worker can dispatch **one layer of sub-workers** (`depth 1`) with its own restricted
`orchestrator_dispatch`, which takes a `message` and nothing else. A sub-worker gets the host's file
tools plus read-only `orchestrator_read` and `orchestrator_report`: it can edit workspace files, it
cannot write `notes.json` (no `orchestrator_write`), and it cannot dispatch further. Its reports and
timeouts go to the **parent worker's** session only — the orchestrator never sees a sub-worker's
handle — and it is dropped as soon as it settles. The subagent package that used to provide a second
parallel channel is no longer installed, so this is the only way down.

The plugin never reconciles on `session_start`: opening a session neither injects a message nor spends a
turn. Recovery is explicit — `orchestrator_read` with `op: "resume"` is the one place that selects a plan
and reports where it stands (status line, index, ready queue, waiting for answer/review, blocked). A crash
writes `interrupted.json` under the agent dir and exits; `resume <plan>` shows `上次崩溃: <at> · <reason>`
when that plan is in the record and then drops only that plan's entry, while `/orchestrator status` lists
every active plan plus the whole record and clears it. There is no concurrency cap: use
`orchestrator_workers` to see live workers and abort them, individually or all.

When a plan cannot pass validation, `orchestrator_read` with `op: "inspect"` returns the raw notes and
the validation errors, and `orchestrator_write` with `op: "repair"` applies model-supplied
`title`/`description`/`content` and `index`, then re-validates and writes. The plugin never truncates
a summary or drops an index entry on its own; those are semantic choices for the model.

## Development

```bash
pnpm --filter @kxh4892636/pi-toolkit test
pnpm --filter @kxh4892636/pi-toolkit test:coverage
pnpm --filter @kxh4892636/pi-toolkit check

# 宿主运行时自检（需要 pi 的模型凭据）：关模式后 read/bash/edit/write 是否回来。
# 走的是 /reload 与 before_agent_start 在 pi 里的真实实现，单测的假 pi 覆盖不到。
cd packages/pi-toolkit && node scripts/reload-check.mjs
```
