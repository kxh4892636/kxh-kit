---
status: completed
---

# Anki MCP 迁移为 CLI

## 问题

用户会在 Anki 中安装 AnkiConnect 插件（anki-mcp-server 所依赖的 add-on），但不想使用 MCP。需要把 anki-mcp-server 迁移为一个 CLI：用户在终端用 `anki-cli` 通过 AnkiConnect 控制 Anki，达成与 MCP 相同的效果——48 个工具（37 essential + 11 GUI，以代码为准）全部覆盖，行为、校验、安全检查、错误提示与 MCP 版本一致。

## 方案

移植上游 `anki-mcp-server`（MIT，v0.24.1，基线 commit 8b82692）的工具层到 kxh-kit monorepo 的新包 `packages/anki-cli`：

- **保留**：AnkiConnect 客户端（请求串行化互斥、重试、背压、只读守卫、错误分类）、48 个工具的业务逻辑、action 纯函数、zod 参数/输出 schema、媒体安全校验（SSRF/路径穿越/文件类型）、全部 utils 及其语义。
- **替换**：MCP 注册层（`@Tool` 装饰器）→ 分组子命令；NestJS DI/Logger → 轻量装配与自研 logger；`CallToolResult` 包装 → JSON 输出协议 + 退出码。
- **删除**：MCP 传输层（stdio/http/tunnel）、prompts、resources、HTTP 守卫、ngrok、MCPB 打包、update-notifier、MCP 依赖全家桶。

CLI 形态：`anki-cli <资源> <动词> [选项]`，全部输出 JSON（见 ADR-0001），数据形状与 MCP structuredContent 一致。

## 已排除的备选

- **包装上游 npm 包**：上游不导出工具层 API，只能经 MCP stdio 子进程通信，等于没有迁移。
- **全新最简 CLI**：丢弃上游打磨过的逻辑（渲染内容提取、统计聚合、媒体安全、错误提示），不满足「相同效果」。
- **保留 MCP 再加一层 CLI 壳**：用户明确不想要 MCP。

## 实施决策

- **包与工具链**：`packages/anki-cli`，名 `@kxh4892636/anki-cli`，bin `anki-cli`；Node >=22.12、ESM；依赖/测试/构建/检查一律走 `vp`（common workflow 0002）；测试 vitest，构建 `vp pack`（vite lib）。
- **移植基线**：`.temp/anki-mcp-server` @ 8b82692，一次性移植，不跟踪上游；README 注明来源与 MIT 归属，代码文件保留来源说明。
- **代码规范**：遵循 code-spec；上游 `enum CardType/CardRating` 改为 `const` 对象 + 派生联合类型（code-spec 禁 enum，tsconfig `erasableSyntaxOnly` 亦要求）。
- **zod 单一事实源**：每个命令导出其 params schema（移植上游工具 schema），commander 选项定义与运行时校验由它派生；上游工具 description 迁移为命令 help 文本。
- **输出协议**：stdout 只输出结果 JSON（默认 2 空格缩进，全局 `--compact` 输出单行）；stderr 只输出 `{success:false, error, action?, hint?, ...}`；退出码 0=成功、1=运行时错误（Anki 未运行/AnkiConnect 错误/校验失败）、2=用法错误（commander 默认）。
- **客户端**：ky + async-mutex 保留；串行化、重试（408/413/429/5xx，限 2 次）、背压（MAX_QUEUE_DEPTH=50）、只读守卫（WRITE_ACTIONS 集合）、错误分类（403/HTTP/fetch 连接/AnkiConnect error）1:1 移植；NestJS `@Injectable`/`Logger` → 构造注入 + 轻量 logger（`LOG_LEVEL`，输出 stderr）。
- **配置**：env 与上游同名——`ANKI_CONNECT_URL`（默认 `http://localhost:8765`）、`ANKI_CONNECT_API_KEY`、`ANKI_CONNECT_API_VERSION`（6）、`ANKI_CONNECT_TIMEOUT`（5000）、`READ_ONLY`、`LOG_LEVEL`；zod schema 校验；全局选项 `--anki-connect`/`--read-only`/`--debug`/`--compact` 覆盖 env。
- **目录结构**（src 为 level-1）：`config/`、`client/`、`types/`、`utils/`、`cli/`（程序装配、json 输出、错误协议）、`commands/{decks,notes,cards,models,tags,media,stats,gui}/`（每命令一文件，测试放同级 `__tests__/`）、`main.ts`（bin 入口）。
- **复杂参数约定**：`--field k=v`（可重复）表示 fields record；批量笔记输入经 stdin JSON；破坏性命令（deleteNotes/removeModelField/clearUnusedTags/deleteMediaFile）要求 `--yes`（对应上游 confirmDeletion/confirm 参数）。
- **测试策略**：单测移植上游 spec（注入假 client 改为假 AnkiConnect 服务器 + 真 client）；集成测试起本地假 AnkiConnect HTTP 服务器，端到端验证命令输出 JSON 形状；真实 Anki 验收在用户机器上执行（issue 10 的验收清单）。
- **命令注册机制**：`src/cli/program.ts` 用 `import.meta.glob('../commands/*/index.ts', { eager: true })` 自动发现各组 `registerCommand(program)`——后续 issue 只新增自己的目录与文件，不改任何共享文件，保证并行 worktree 的改动集合互不相交、合并零冲突。
- **执行策略**（用户指定，2026-08-20 修订）：每个 issue/批次一个 git worktree + 分支（worktree 落 `.claude/worktrees/`，分支 `anki-cli/NN`），**串行执行**——同一时间只运行一个实现者；一次批量可执行多个 issue（一个实现者按序完成多个 issue 的命令组后统一合入）。01 已交付；02–04 在修订前已并行启动，允许其完成（合入仍串行）；其后批次串行推进：05+06 → 07+08 → 09 → 10（10 依赖 04），全部完成后合入 `feature/anki-cli`。
- **依赖一次性装齐**：全部运行时依赖（commander、zod、ky、async-mutex、mime、ipaddr.js）由 01 写入 `packages/anki-cli/package.json` 并更新 lockfile；后续 issue 不新增依赖，避免并行分支改 lockfile 冲突。不引 remark/unified（`markdown.utils` 仅被要删除的 twenty-rules prompt 使用，不移植）。
- **命令映射**：48 条子命令 ↔ 48 个上游工具（README 声称 42，代码实为 48，以代码为准），见下表；各 issue 的参数与上游工具 schema 对齐。

### 命令映射表

| #     | CLI 命令                                                                                                                            | 上游工具                        | 分组 issue |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| 1     | `anki-cli sync`                                                                                                                     | sync                            | 01         |
| 2     | `anki-cli decks list [--stats]`                                                                                                     | listDecks                       | 02         |
| 3     | `anki-cli decks stats <deck>`                                                                                                       | deckStats                       | 02         |
| 4     | `anki-cli decks create <name>`                                                                                                      | createDeck                      | 02         |
| 5     | `anki-cli decks move <deck> <cardIds...>`                                                                                           | changeDeck                      | 02         |
| 6     | `anki-cli notes add --deck --model --field k=v... [--tag ...] [--allow-duplicate] [--duplicate-scope deck\|collection]`             | addNote                         | 03         |
| 7     | `anki-cli notes add-batch --deck --model [--tag ...] [--allow-duplicate] [--duplicate-scope]`（笔记数组经 stdin JSON）              | addNotes                        | 03         |
| 8     | `anki-cli notes find <query>`                                                                                                       | findNotes                       | 03         |
| 9     | `anki-cli notes info <noteIds...>`                                                                                                  | notesInfo                       | 03         |
| 10    | `anki-cli notes update <id> --field k=v...`                                                                                         | updateNoteFields                | 03         |
| 11    | `anki-cli notes delete <noteIds...> --yes`                                                                                          | deleteNotes                     | 03         |
| 12    | `anki-cli cards due [--deck] [--limit] [--no-learning] [--include-new]`                                                             | get_due_cards                   | 04         |
| 13    | `anki-cli cards list [--deck] [--state due\|new\|learning\|suspended\|buried] [--limit]`                                            | getCards                        | 04         |
| 14    | `anki-cli cards present <id> [--answer]`                                                                                            | present_card                    | 04         |
| 15    | `anki-cli cards rate <id> <1-4>`                                                                                                    | rate_card                       | 04         |
| 16    | `anki-cli models list`                                                                                                              | modelNames                      | 05         |
| 17    | `anki-cli models fields <name>`                                                                                                     | modelFieldNames                 | 05         |
| 18    | `anki-cli models styling <name>`                                                                                                    | modelStyling                    | 05         |
| 19    | `anki-cli models templates <name>`                                                                                                  | modelTemplates                  | 05         |
| 20    | `anki-cli models create <name> --field ... --templates <json>`                                                                      | createModel                     | 05         |
| 21    | `anki-cli models update-styling <name> --css <file\|->`                                                                             | updateModelStyling              | 05         |
| 22    | `anki-cli models update-templates <name> --templates <json>`                                                                        | updateModelTemplates            | 05         |
| 23    | `anki-cli models field-add <name> <field> [--index]`                                                                                | addModelField                   | 05         |
| 24    | `anki-cli models field-remove <name> <field> --yes`                                                                                 | removeModelField                | 05         |
| 25    | `anki-cli models field-rename <name> <old> <new>`                                                                                   | renameModelField                | 05         |
| 26    | `anki-cli models field-reposition <name> <field> <index>`                                                                           | repositionModelField            | 05         |
| 27    | `anki-cli tags list`                                                                                                                | getTags                         | 06         |
| 28    | `anki-cli tags add <noteIds...> --tag ...`                                                                                          | addTags                         | 06         |
| 29    | `anki-cli tags remove <noteIds...> --tag ...`                                                                                       | removeTags                      | 06         |
| 30    | `anki-cli tags replace <noteIds...> --from --to`                                                                                    | replaceTags                     | 06         |
| 31    | `anki-cli tags clear-unused --yes`                                                                                                  | clearUnusedTags                 | 06         |
| 32    | `anki-cli media list [--pattern]`                                                                                                   | getMediaFilesNames              | 07         |
| 33    | `anki-cli media get <filename> [--out <path>]`                                                                                      | retrieveMediaFile               | 07         |
| 34    | `anki-cli media store (--file <path> \| --url <url> \| --data <base64>) [--filename] [--delete-original]`                           | storeMediaFile                  | 07         |
| 35    | `anki-cli media delete <filename> --yes`                                                                                            | deleteMediaFile                 | 07         |
| 36    | `anki-cli stats collection`                                                                                                         | collection_stats                | 08         |
| 37    | `anki-cli stats review --start <YYYY-MM-DD> [--end <YYYY-MM-DD>] [--deck <n>]`                                                      | review_stats                    | 08         |
| 38-48 | `anki-cli gui {browse,select,selected-notes,add-cards,edit,deck-overview,deck-browser,current-card,show-question,show-answer,undo}` | 11 个 gui* 工具                 | 09         |
| 49    | `anki-cli review [--deck] [--limit] [--include-new] [--no-sync]`                                                                    | review-session prompt 的 CLI 化 | 10         |

## 工作环境

- kxh-kit monorepo：pnpm 11.22 / Node >=22.12 / `vp`（依赖、测试、构建、检查）/ vitest 4 / TS strict（`erasableSyntaxOnly`、`verbatimModuleSyntax`、`exactOptionalPropertyTypes`）。
- 上游代码：`.temp/anki-mcp-server`（git，@8b82692，v0.24.1，只读参考）；其依赖的 add-on 为 AnkiConnect（FooSoft，插件码 2055492159，默认 `http://localhost:8765`）。
- 测试用假 AnkiConnect：测试内置的本地 HTTP 服务器（vitest 内起服务）。
- 用户本机冒烟：Anki + AnkiConnect（localhost:8765）；写操作在专用测试牌组 `anki-cli-smoke` 中执行并在验收后清理（见 issue 10 验收清单）。

## 范围

- 48 条子命令（37 核心 + 11 GUI），行为与上游 MCP 工具一致
- 交互式 `review` 命令（替代 MCP review-session prompt 的复习闭环）
- 只读模式、媒体安全校验、错误提示与 hint
- README（中文：安装、AnkiConnect 配置、命令参考、JSON 契约、上游归属）

## 非范围

- MCP 服务器 / tunnel / ngrok / MCPB / prompts / resources
- AnkiConnect 插件本身（用户自行安装）
- 与 AnkiWeb 的同步服务
- 上游后续版本自动跟踪

## 待定

- shell 补全脚本（completion）
- 人类可读表格渲染器（若需要，以 `--format` 扩展，不破坏 JSON 契约）

## 上下文

- 上游仓库：https://github.com/ankimcp/anki-mcp-server（本地克隆 `.temp/anki-mcp-server` @8b82692，v0.24.1，MIT）
- AnkiConnect 文档：https://git.sr.ht/~foosoft/anki-connect
- ADR：../../adr/0001-cli-输出仅-json.md
- 领域术语：../../CONTEXT.md
- 旧计划参考：git 历史 9f7417f（域 `anki`，已被 3fe1286 移除；吸收其结论：工具数以代码为准 48 个、冒烟用 `anki-cli-smoke` 牌组；其「依赖最小化+原生 fetch」被本 spec 的移植保真策略取代）

## Issue

| #   | Issue                                                             | 状态      | 阻塞于 | 下一步 |
| --- | ----------------------------------------------------------------- | --------- | ------ | ------ |
| 01  | [CLI 骨架与 AnkiConnect 传输层](01-CLI骨架与AnkiConnect传输层.md) | completed | —      | 已交付 |
| 02  | [牌组命令组](02-牌组命令组.md)                                    | completed | 01     | 已交付 |
| 03  | [笔记命令组](03-笔记命令组.md)                                    | completed | 01     | 已交付 |
| 04  | [卡片复习命令组](04-卡片复习命令组.md)                            | completed | 01     | 已交付 |
| 05  | [模板命令组](05-模板命令组.md)                                    | completed | 01     | 已交付 |
| 06  | [标签命令组](06-标签命令组.md)                                    | completed | 01     | 已交付 |
| 07  | [媒体命令组](07-媒体命令组.md)                                    | completed | 01     | 已交付 |
| 08  | [统计命令组](08-统计命令组.md)                                    | completed | 01     | 已交付 |
| 09  | [GUI 命令组](09-GUI命令组.md)                                     | completed | 01     | 已交付 |
| 10  | [交互式复习与文档](10-交互式复习与文档.md)                        | completed | 04     | 已交付 |
