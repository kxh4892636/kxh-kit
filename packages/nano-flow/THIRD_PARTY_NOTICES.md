# Third-party notices

## anki-mcp-server

The `nnf anki` implementation is adapted from the tool layer of
[ankimcp/anki-mcp-server](https://github.com/ankimcp/anki-mcp-server), version 0.24.1 at commit
`8b82692`.

The adapted design includes the AnkiConnect client and action mappings, input and response
validation, and the media safety controls for MIME allowlisting, import-directory boundaries,
URL host/IP checks against server-side request forgery, and filename/path traversal prevention.
Nano Flow removes the NestJS and MCP transport layers while preserving those behavioral and safety
contracts in `packages/nano-flow/src/builtins/anki`.

anki-mcp-server is licensed under the MIT License, Copyright (c) 2026 Anatoly Tarnavsky. The full
license notice is included in [LICENSE](LICENSE).
