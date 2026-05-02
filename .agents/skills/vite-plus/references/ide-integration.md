# Vite+ IDE Integration

## VS Code

Install the [Vite Plus Extension Pack](https://marketplace.visualstudio.com/items?itemName=VoidZero.vite-plus-extension-pack):
- `Oxc` for formatting and linting via `vp check`
- `Vitest` for test runs via `vp test`

### Recommended VS Code Config

```json
// .vscode/extensions.json
{
  "recommendations": ["VoidZero.vite-plus-extension-pack"]
}
```

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "[javascript]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[javascriptreact]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescript]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "oxc.fmt.configPath": "./vite.config.ts",
  "editor.formatOnSave": true,
  "editor.formatOnSaveMode": "file",
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit"
  }
}
```

- Language-specific overrides are needed because VS Code prioritizes user-level `[language]` settings over workspace-level `editor.defaultFormatter`.
- `oxc.fmt.configPath` set to `./vite.config.ts` keeps editor format-on-save aligned with the `fmt` block.
- `formatOnSaveMode: "file"` is used because Oxfmt does not support partial formatting.

### NPM Scripts Panel

To run scripts through `vp` from the VS Code NPM Scripts panel:

```json
// .vscode/settings.json
{
  "npm.scriptRunner": "vp"
}
```

This is included automatically by `vp create` but not by `vp migrate`.

## Zed

Install the [oxc-zed](https://github.com/oxc-project/oxc-zed) extension from the Zed extensions marketplace.

### Recommended Zed Config

```json
// .zed/settings.json
{
  "lsp": {
    "oxlint": {
      "initialization_options": {
        "settings": {
          "run": "onType",
          "fixKind": "safe_fix",
          "typeAware": true,
          "unusedDisableDirectives": "deny"
        }
      }
    },
    "oxfmt": {
      "initialization_options": {
        "settings": {
          "configPath": "./vite.config.ts",
          "run": "onSave"
        }
      }
    }
  },
  "languages": {
    "JavaScript": {
      "format_on_save": "on",
      "prettier": { "allowed": false },
      "formatter": [{ "language_server": { "name": "oxfmt" } }],
      "code_action": "source.fixAll.oxc"
    },
    "TypeScript": {
      "format_on_save": "on",
      "prettier": { "allowed": false },
      "formatter": [{ "language_server": { "name": "oxfmt" } }]
    },
    "Vue.js": {
      "format_on_save": "on",
      "prettier": { "allowed": false },
      "formatter": [{ "language_server": { "name": "oxfmt" } }]
    }
  }
}
```

Setting `configPath` to `./vite.config.ts` aligns editor format-on-save with the `fmt` block. The full generated config covers additional languages (CSS, HTML, JSON, Markdown, etc.) — run `vp create` or `vp migrate` to get the complete file written automatically.
