# @kxh4892636/pi-deepseek-web

A [pi](https://pi.dev) extension that adds two model-facing web tools:

- **`web_search`** — calls DeepSeek's Anthropic-compatible Messages API with the native
  `web_search_20250305` server tool and returns an optional answer plus a deduplicated source list.
- **`web_fetch`** — retrieves one URL over HTTP(S) and returns readable content; HTML is converted
  to GitHub-flavored markdown with turndown.

DeepSeek has no fetch server tool (its API accepts only `web_search_20250305` /
`web_search_20260209`), so `web_fetch` goes directly to the network.

## Install

```bash
pi install /absolute/path/to/packages/pi-deepseek-web
```

The package ships TypeScript and is loaded by pi's jiti loader; no build step is needed. Runtime
dependencies (`turndown`, `@joplin/turndown-plugin-gfm`) must be installed in the package's
`node_modules` (for a workspace checkout, run `pnpm install` first).

## Configuration

Create `~/.pi/agent/pi-deepseek-web.json` (or `.pi/pi-deepseek-web.json` in a project):

```json
{
  "apiKey": "sk-...",
  "baseURL": "https://api.deepseek.com/anthropic/v1",
  "model": "deepseek-v4-flash",
  "maxUses": 5
}
```

Precedence (low to high): `~/.pi/agent/pi-deepseek-web.json`, `<cwd>/.pi/pi-deepseek-web.json`,
`$PI_DEEPSEEK_WEB_CONFIG` (an explicit file path). Keys in later files win.

| Field                   | Default                                 | Meaning                                          |
| ----------------------- | --------------------------------------- | ------------------------------------------------ |
| `apiKey`                | —                                       | Literal DeepSeek API key.                        |
| `apiKeyEnv`             | `DEEPSEEK_API_KEY`                      | Env var read when `apiKey` is absent.            |
| `baseURL`               | `https://api.deepseek.com/anthropic/v1` | Anthropic-compatible base; `/messages` appended. |
| `model`                 | `deepseek-v4-flash`                     | Anthropic-format model name.                     |
| `apiVersion`            | `2023-06-01`                            | `anthropic-version` header.                      |
| `maxTokens`             | `4096`                                  | Generated-token cap per search.                  |
| `maxUses`               | `5`                                     | Native `web_search` uses per request.            |
| `fetchMaxResponseBytes` | `5000000`                               | Fetch byte cap.                                  |
| `fetchMaxBodyChars`     | `100000`                                | Fetch decoded-character cap.                     |
| `fetchTimeoutMs`        | `30000`                                 | Fetch timeout.                                   |

The API key resolution order is `apiKey` > the environment variable named by `apiKeyEnv`.

## Security

The API key is stored in a plaintext file under your home directory. Keep the repository copy
(only `pi-deepseek-web.example.json` is committed) free of secrets, and treat `web_search` /
`web_fetch` output as untrusted external data (the tool text says so).

## Development

```bash
pnpm --filter @kxh4892636/pi-deepseek-web test
pnpm --filter @kxh4892636/pi-deepseek-web test:coverage
pnpm --filter @kxh4892636/pi-deepseek-web check
```
