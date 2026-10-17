# @kxh4892636/pi-deepseek-web

A [pi](https://pi.dev) extension that adds two model-facing web tools backed by
DeepSeek's official [Search and Fetch APIs](https://api-docs.deepseek.com/zh-cn/guides/search):

- **`web_search`** — `POST /v1/tools/search`. Tool parameters mirror the official request body:
  `query` (1–128 characters, supports the search syntax below), `count` (1–50), `ori_question`,
  `localization` and `need_content`. The result `details` are `{ count, results }`, preserving every
  documented response field: `rerank_score`, `title`, `url`, `snippet`, `summary`, `content`,
  `site_name`, `site_icon`, `date` and `authority`. Model-visible text adds title/URL, summary or
  snippet, score, authority, site, date and (when `need_content` is true) page content.
- **`web_fetch`** — `POST /v1/tools/fetch`. Request `{ url }`; response `{ title, content }` with
  Markdown content truncated at `fetchMaxContentChars`. `details` are
  `{ url, title?, content, truncated }`.

Both tools use the same Bearer key. There is no Anthropic Messages call, model turn, turndown
conversion, or direct HTTP fetch in the plugin.

## Install

```bash
pi install /absolute/path/to/packages/pi-deepseek-web
```

The package ships TypeScript and is loaded by pi's jiti loader; no build step is needed. It has no
bundled runtime dependencies (the pi SDK and typebox are peer dependencies).

## Configuration

Create `~/.pi/agent/pi-deepseek-web.json` (or `.pi/pi-deepseek-web.json` in a project):

```json
{
  "apiKey": "sk-...",
  "baseURL": "https://api.deepseek.com",
  "searchCount": 10,
  "fetchMaxContentChars": 100000,
  "timeoutMs": 30000
}
```

Precedence (low to high): `~/.pi/agent/pi-deepseek-web.json`, `<cwd>/.pi/pi-deepseek-web.json`,
`$PI_DEEPSEEK_WEB_CONFIG` (an explicit file path). Keys in later files win; a project `.pi` config
is ignored when the project is untrusted.

| Field                  | Default                    | Meaning                                      |
| ---------------------- | -------------------------- | -------------------------------------------- |
| `apiKey`               | —                          | Literal DeepSeek API key.                    |
| `apiKeyEnv`            | `DEEPSEEK_API_KEY`         | Env var read when `apiKey` is absent.        |
| `baseURL`              | `https://api.deepseek.com` | API root; a trailing `/v1` is also accepted. |
| `searchCount`          | `10`                       | Default `web_search` result count (1–50).    |
| `fetchMaxContentChars` | `100000`                   | Character cap for `web_fetch` content.       |
| `timeoutMs`            | `30000`                    | Timeout for one Search or Fetch request.     |

The API key resolution order is `apiKey` > the environment variable named by `apiKeyEnv`.

`baseURL` must be an absolute `http(s)` URL without query/fragment. The legacy Anthropic endpoint
(`.../anthropic/v1`) is rejected with an actionable error; point `baseURL` at the API root instead.

## Search syntax

The `query` parameter is passed through to DeepSeek's search service. Operators can be combined in
one query:

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

Set `need_content: true` only when summaries are insufficient: it fills each result's `content`
with the page body and can substantially increase output size. `ori_question` carries the original
user question when `query` is a keyword rewrite; `localization` is an IP address for localized
results and is normally omitted.

### Migrating from 0.1.0

- Set `baseURL` to `https://api.deepseek.com` (remove the `/anthropic/v1` suffix).
- Remove `model`, `apiVersion`, `maxTokens` and `maxUses`; they are no longer read.
- Remove `fetchMaxResponseBytes`, `fetchMaxBodyChars` and `fetchTimeoutMs`; use
  `fetchMaxContentChars` and `timeoutMs`.
- `web_fetch` now calls DeepSeek and requires an API key. Its `details` changed from
  `{ url, statusCode, contentType, truncated }` to `{ url, title?, content, truncated }`. Pages
  without extractable Markdown (for example some raw text files) may return HTTP 404 from the Fetch
  API.

## API limits and billing

DeepSeek rate-limits Search and Fetch independently at 5 QPS per account and bills successful
requests (currently ¥5 per 1,000): Search must return a non-empty `results` array and Fetch must
return page content. The plugin does not retry automatically: HTTP 408/429/5xx can be retried after
a wait, HTTP 402 means the account needs a top-up, and other 4xx errors should be fixed before
retrying. `web_fetch` returns 403 when the target is refused by the safety policy and 404 when no
usable content can be extracted.

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
