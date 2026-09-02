# pi-deepseek-web

`@kxh4892636/pi-deepseek-web` is a Pi package that registers two model tools:

- `web_search` sends one DeepSeek Anthropic-compatible Messages request per query and consumes only native `web_search_tool_result` blocks.
- `web_fetch` anonymously reads one public HTTP(S) text page through a DNS-pinned transport and returns bounded text or sanitized GFM Markdown.

## Install

Install the package from a local checkout while developing:

```powershell
pi install C:\path\to\kxh-kit\packages\pi-deepseek-web
```

Pi loads `src/index.ts` from the package manifest and registers exactly `web_search` and `web_fetch`.

## Configure

Copy `config.example.json` to `pi-deepseek-web.json` in Pi's global agent directory (normally `~/.pi/agent`). The `search` object is required; `fetch` is optional and uses the documented defaults.

Prefer an environment variable for the credential:

```powershell
$env:DEEPSEEK_API_KEY = "your-key"
```

Alternatively, `search.apiKey` may contain a literal credential and takes precedence over `search.apiKeyEnv`. Keep the global configuration private and never add it to a repository.

`search.baseURL` is an HTTPS service root such as `https://api.deepseek.com/anthropic`. Do not include `/v1`, credentials, a query, or a fragment; the plugin appends `/v1/messages`. Unknown fields, malformed values, and missing credentials fail closed. Configuration is reloaded once at the start of every tool call.

## Tool inputs

`web_search` accepts one to four queries:

```json
{ "queries": ["DeepSeek Anthropic API", "Pi coding agent extensions"] }
```

Distinct queries run concurrently. Results are taken only from native structured blocks, deduplicated by URL, merged round-robin, and capped by `search.maxResults`.

`web_fetch` accepts one URL of at most 2,048 characters:

```json
{ "url": "https://example.com/" }
```

Only anonymous public HTTP(S) destinations are allowed. Local, private, reserved, credential-bearing, and DNS64-mapped private addresses are rejected. Redirects must remain on the same origin and are resolved and pinned again. HTML/XHTML, `text/*`, JSON, and XML are supported; binary or missing content types and unsupported charsets fail closed. Non-2xx pages remain readable results with their status code.

## Trust and output limits

Web content is always labeled as untrusted data. HTML scripts, forms, embedded objects, images, and hidden content are removed before Turndown plus GFM conversion. Conversion failure produces a fixed omission marker rather than raw HTML. The final model-visible result preserves its trust notice, truncation notice, and final URL citation while enforcing 50 KiB, 2,000 lines, and the configured output limit.

Search credentials are sent only as `x-api-key` to the validated DeepSeek endpoint. They are never forwarded to fetched sites or placed in tool details, errors, logs, examples, or package artifacts.

## Development and verification

Deterministic checks do not use the public network:

```powershell
pnpm --filter @kxh4892636/pi-deepseek-web check
pnpm --filter @kxh4892636/pi-deepseek-web test
pnpm --filter @kxh4892636/pi-deepseek-web test:coverage
pnpm --filter @kxh4892636/pi-deepseek-web build
```

An explicit live smoke reads the global configuration, makes exactly one single-query DeepSeek search and one public HTTPS fetch, and does not retry:

```powershell
pnpm --filter @kxh4892636/pi-deepseek-web test:live
```

The live smoke fails when configuration is missing; it is not part of the normal test or CI commands.
