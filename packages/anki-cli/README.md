# anki-cli

通过 AnkiConnect 控制 Anki 的命令行工具。由 [ankimcp/anki-mcp-server](https://github.com/ankimcp/anki-mcp-server)（MIT，v0.24.1，commit `8b82692`）的 MCP 工具层迁移而来：48 个 MCP 工具（37 核心 + 11 GUI）迁移为 48 条子命令，行为、校验、安全检查与错误提示与上游一致，但不依赖 MCP。

## 前置条件

- [Anki](https://apps.ankiweb.net/) 已安装并运行
- [AnkiConnect](https://github.com/FooSoft/anki-connect) 插件（Anki 插件码 **2055492159**）已安装，默认监听 `http://localhost:8765`
- Node.js >= 22.12.0

## 安装与构建

```bash
# 在 kxh-kit monorepo 内
vp install
vp run @kxh4892636/anki-cli#build   # 产出 dist/main.mjs
node packages/anki-cli/dist/main.mjs --help
```

## 配置

环境变量（与上游同名同默认）：

| 变量                       | 默认                               |
| -------------------------- | ---------------------------------- |
| `ANKI_CONNECT_URL`         | `http://localhost:8765`            |
| `ANKI_CONNECT_API_KEY`     | 无                                 |
| `ANKI_CONNECT_API_VERSION` | `6`                                |
| `ANKI_CONNECT_TIMEOUT`     | `5000`                             |
| `READ_ONLY`                | `false`（`true`/`1` 开启只读模式） |
| `LOG_LEVEL`                | `info`                             |

全局选项（子命令前后均可）：`--anki-connect <url>`、`--read-only`、`--debug`、`--compact`。

## 输出契约

- stdout 只输出结果 JSON（默认 2 空格缩进，`--compact` 单行），形状与上游 MCP structuredContent 一致；
- stderr 只输出错误对象 `{success:false, error, action?, hint?, ...}`；
- 退出码：0 成功 / 1 运行时错误（Anki 未运行、AnkiConnect 错误、校验失败、只读拦截）/ 2 用法错误。

## 命令

| 分组   | 命令                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sync   | `sync`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| decks  | `decks list [--stats]`、`decks stats <deck> [--ease-buckets csv] [--interval-buckets csv]`、`decks create <name>`、`decks move <deck> <cardIds...>`                                                                                                                                                                                                                                                                                                                |
| notes  | `notes add --deck --model --field k=v... [--tag ...] [--allow-duplicate] [--duplicate-scope deck\|collection]`、`notes add-batch --deck --model [--tag ...]`(笔记数组经 stdin JSON)、`notes find <query>`、`notes info <ids...>`、`notes update <id> --field k=v... [--audio json]... [--picture json]...`、`notes delete <ids...> --yes`                                                                                                                          |
| cards  | `cards due [--deck] [--limit] [--no-learning] [--include-new]`、`cards list [--deck] [--state due\|new\|learning\|suspended\|buried] [--limit]`、`cards present <id> [--answer]`、`cards rate <id> <1-4>`                                                                                                                                                                                                                                                          |
| models | `models list`、`models fields <name>`、`models styling <name>`、`models templates <name>`、`models create <name> --field ... --templates <json> [--css file\|-] [--cloze]`、`models update-styling <name> --css file\|-`、`models update-templates <name> --templates <json>`、`models field-add <name> <field> [--index]`、`models field-remove <name> <field> --yes`、`models field-rename <name> <old> <new>`、`models field-reposition <name> <field> <index>` |
| tags   | `tags list [--pattern]`、`tags add <ids...> --tag ...`、`tags remove <ids...> --tag ...`、`tags replace <ids...> --from --to`、`tags clear-unused --yes`                                                                                                                                                                                                                                                                                                           |
| media  | `media list [--pattern]`、`media get <filename> [--out path]`、`media store --filename (--file path \| --url url \| --data base64)`、`media delete <filename> --yes`                                                                                                                                                                                                                                                                                               |
| stats  | `stats collection [--ease-buckets csv] [--interval-buckets csv]`、`stats review --start YYYY-MM-DD [--end YYYY-MM-DD] [--deck]`                                                                                                                                                                                                                                                                                                                                    |
| gui    | `gui browse <query> [--order --column]`、`gui select <cardId>`、`gui selected-notes`、`gui add-cards --deck --model --field k=v...`、`gui edit <noteId>`、`gui deck-overview <deck>`、`gui deck-browser`、`gui current-card`、`gui show-question`、`gui show-answer`、`gui undo`                                                                                                                                                                                   |
| review | `review [--deck] [--limit] [--include-new] [--no-sync]`(交互式: 逐张输出问题 JSON, stdin 输入 1-4 评分, q 退出)                                                                                                                                                                                                                                                                                                                                                    |

## 只读模式

`--read-only` / `READ_ONLY=true` 拦截全部写操作（笔记/牌组/标签/媒体/模板），复习与同步始终放行。

## 媒体安全

- `media store --file` 仅允许媒体 MIME 类型（`MEDIA_ALLOWED_TYPES` 扩展，`MEDIA_IMPORT_DIR` 限定目录）；
- `media store --url` 与 `notes update --audio/--picture` 阻止私网/环回地址（`MEDIA_ALLOWED_HOSTS` 放行指定主机）；
- 文件名经路径穿越净化。

## 已知上游坑

- `notes update` 在目标笔记于 Anki 浏览器中打开时更新会静默失败（结果中始终带 warning 提示）；
- `sync` 依赖桌面端已登录 AnkiWeb；
- `notes delete` / `models field-remove` / `tags clear-unused` / `media delete` 不可逆，必须 `--yes`。

## 验收

真实 Anki 环境的手工验收清单见 `docs/anki-cli/smoke-checklist.md`（写操作在专用测试牌组 `anki-cli-smoke` 中执行并在验收后清理）。

## 归属

本包代码自 [ankimcp/anki-mcp-server](https://github.com/ankimcp/anki-mcp-server)（MIT License, Copyright © 2026 Anatoly Tarnavsky）的 MCP 工具层移植，剥离 NestJS/MCP 框架，保留客户端、工具逻辑、校验与安全检查；命令行为与上游 v0.24.1（commit `8b82692`）对齐。
