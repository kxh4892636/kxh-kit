# pi-deepseek-web

`@kxh4892636/pi-deepseek-web` is a Pi package that exposes DeepSeek-backed web search and anonymous public-page fetching.

## Configuration

Copy `config.example.json` to `pi-deepseek-web.json` in Pi's agent directory (normally `~/.pi/agent`). Keep the API key in the environment whenever possible:

```powershell
$env:DEEPSEEK_API_KEY = "your-key"
```

The `search` section is required. The `fetch` section is optional and uses the values in the example by default. Unknown fields and malformed values are rejected. A literal `search.apiKey` takes precedence over `search.apiKeyEnv`, but must never be committed.

## Development

```powershell
pnpm --filter @kxh4892636/pi-deepseek-web check
pnpm --filter @kxh4892636/pi-deepseek-web test
pnpm --filter @kxh4892636/pi-deepseek-web build
```
