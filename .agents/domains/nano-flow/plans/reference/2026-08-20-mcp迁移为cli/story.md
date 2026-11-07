# mcp迁移为cli

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 mcp迁移为cli

用户会在 Anki 中安装 AnkiConnect 插件（anki-mcp-server 所依赖的 add-on），但不想使用 MCP。需要把 anki-mcp-server 迁移为一个 CLI：用户在终端用 `anki-cli` 通过 AnkiConnect 控制 Anki，达成与 MCP 相同的效果——48 个工具（37 essential + 11 GUI，以代码为准）全部覆盖，行为、校验、安全检查、错误提示与 MCP 版本一致。
