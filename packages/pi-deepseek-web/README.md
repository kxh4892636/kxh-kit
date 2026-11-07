# @kxh4892636/pi-deepseek-web

A [pi](https://pi.dev) extension that adds two model-facing web tools backed by
DeepSeek's official [Search and Fetch APIs](https://api-docs.deepseek.com/zh-cn/guides/search).
The model-facing contract follows the DeepSeek Harness `tool-web` package:

- **`web_search`** — `POST /v1/tools/search`. The only model argument is
  `queries: string[]`; their results are merged. Search is discovery only: it returns titles, URLs,
  snippets/summaries and dates, and never page bodies.
- **`web_fetch`** — `POST /v1/tools/fetch`. The only model argument is `url`. The result is the
  page Markdown, capped at `fetchMaxOutputChars`.

Both tools use the same Bearer key. There is no Anthropic Messages call, model turn, turndown
conversion, or direct HTTP fetch in the plugin.

## Install

```bash
pi install /absolute/path/to/packages/pi-deepseek-web
```

The package ships TypeScript and is loaded by pi's jiti loader; no build step is needed. It has no
bundled runtime dependencies (the pi SDK and typebox are peer dependencies).

## Configuration

Every tunable is a JSON field. Create `~/.pi/agent/pi-deepseek-web.json` (or
`.pi/pi-deepseek-web.json` in a project):

```json
{
  "apiKey": "sk-...",
  "baseURL": "https://api.deepseek.com",
  "searchCount": 10,
  "searchMaxQueries": 10,
  "searchMaxResults": 10,
  "searchSummaryMaxChars": 800,
  "searchTimeoutMs": 30000,
  "fetchTimeoutMs": 30000,
  "fetchMaxOutputChars": 200000
}
```

Precedence (low to high): `~/.pi/agent/pi-deepseek-web.json`, `<cwd>/.pi/pi-deepseek-web.json`,
`$PI_DEEPSEEK_WEB_CONFIG` (an explicit file path). Keys in later files win; a project `.pi` config
is ignored when the project is untrusted.

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

The API key resolution order is `apiKey` > the environment variable named by `apiKeyEnv`.

`baseURL` must be an absolute `http(s)` URL without query/fragment. The legacy Anthropic endpoint
(`.../anthropic/v1`) is rejected with an actionable error; point `baseURL` at the API root instead.

Legacy keys are still honored as fallbacks: `timeoutMs` feeds both timeouts, and
`fetchMaxContentChars` feeds `fetchMaxOutputChars`. New keys win when both are present.

## Search behaviour

Each Search request sends `count = min(searchCount, searchMaxResults)`, `need_content: false`, and
the latest user message as `ori_question` (whitespace collapsed, capped at 128 characters). The
model never controls these fields.

`web_search` validates and normalizes the query list:

- at least one query, at most `searchMaxQueries`
- every query must be non-blank
- exact duplicate strings are collapsed

Multiple queries run concurrently. Results are merged round-robin, deduplicated by URL, and capped
at `searchMaxResults`; when anything is dropped the tool reports `truncated` and the model text
ends with `(Showing the first N sources. Refine the query for more.)`.

Sources are projected to `{ url, title?, snippet?, summary?, publishedAt? }`; ranking-only fields
(`rerank_score`, `authority`, `site_name`, `site_icon`) are not model-visible. Model text uses the
summary (whitespace-collapsed, capped at `searchSummaryMaxChars`) else the snippet, plus the
publication date.

### Search syntax

The query strings are passed through to DeepSeek's search service. Operators can be combined in one
query:

| Operator  | Example                      | Meaning                                                                   |
| --------- | ---------------------------- | ------------------------------------------------------------------------- |
| `site:`   | `DeepSeek site:github.com`   | Restrict results to a site; separate multiple sites with spaces and `OR`. |
| `-site:`  | `DeepSeek -site:example.com` | Exclude a site.                                                           |
| `-`       | `DeepSeek -广告`             | Exclude pages containing a keyword.                                       |
| `-"..."`  | `DeepSeek -"release notes"`  | Exclude a phrase.                                                         |
| `"..."`   | `DeepSeek "精确短语"`        | Match an exact phrase.                                                    |
| `lang:`   | `DeepSeek lang:zh,en`        | Restrict languages.                                                       |
| `after:`  | `DeepSeek after:2025-01-01`  | Only pages published after a date.                                        |
| `before:` | `DeepSeek before:2026-06-01` | Only pages published before a date.                                       |

## Fetch behaviour

`web_fetch` accepts one absolute HTTP(S) URL, up to 8192 characters, with a host and without a
username or password. The result `details` are:

```json
{
  "url": "https://example.com/",
  "statusCode": 200,
  "body": { "kind": "text", "content": "# Example" },
  "truncated": false
}
```

The DeepSeek Fetch API reports neither the target status nor a title, so a success is modelled as
HTTP 200 and the requested URL. Model text is headed by `Fetched <url> (HTTP 200)` plus the
untrusted-content notice; when the complete output would exceed `fetchMaxOutputChars`, it is cut and
ends with `(Content truncated. Fetch a more specific URL or section for the full text.)`.

## Migrating from 0.2.x

- `web_search` now takes `queries: string[]` instead of `query: string`. `count`, `ori_question`,
  `localization` and `need_content` are no longer model arguments; they are deployment policy in
  the JSON config (or, for `ori_question`, injected from the session).
- `web_search` `details` changed from `{ count, results }` to `{ content?, sources, truncated }`,
  with sources projected to `{ url, title?, snippet?, summary?, publishedAt? }`.
- `web_fetch` `details` changed from `{ url, title?, content, truncated }` to
  `{ url, statusCode, body, truncated }`; the response title is no longer returned.
- Config keys `timeoutMs` and `fetchMaxContentChars` still work as fallbacks for
  `searchTimeoutMs`/`fetchTimeoutMs` and `fetchMaxOutputChars`.
- Remove `model`, `apiVersion`, `maxTokens` and `maxUses`; they are no longer read.

## API limits and billing

DeepSeek rate-limits Search and Fetch independently (Search 100 QPS, Fetch 25 QPS per account) and
bills successful requests (currently ¥5 per 1,000): Search must return a non-empty `results` array
and Fetch must return page content. The plugin does not retry automatically: HTTP 408/429/5xx can be
retried after a wait, HTTP 402 means the account needs a top-up, and other 4xx errors should be
fixed before retrying. `web_fetch` returns 403 when the target is refused by the safety policy and
404 when no usable content can be extracted.

## Security

The API key is stored in a plaintext file under your home directory. Keep the repository copy (only
`pi-deepseek-web.example.json` is committed) free of secrets, and treat `web_search` / `web_fetch`
output as untrusted external data (the tool text says so).

## Development

```bash
pnpm --filter @kxh4892636/pi-deepseek-web test
pnpm --filter @kxh4892636/pi-deepseek-web test:coverage
pnpm --filter @kxh4892636/pi-deepseek-web check
```
