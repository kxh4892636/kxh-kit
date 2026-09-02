# Anki 路由

`nnf anki` 经 AnkiConnect 操作桌面端 Anki。开始前确认 Anki 已启动并安装 AnkiConnect；默认地址是 `http://localhost:8765`，需要覆盖时使用 `--anki-connect <url>`。

## 命令族导航

| 任务                                       | 路由                                |
| ------------------------------------------ | ----------------------------------- |
| 牌组列表、统计、创建、移动卡片             | `nnf anki decks`                    |
| 笔记新增、批量新增、查询、详情、更新、删除 | `nnf anki notes`                    |
| 笔记类型、字段、样式与模板                 | `nnf anki models`                   |
| 到期卡片、状态查询、展示与评分             | `nnf anki cards`                    |
| 交互复习或同步 AnkiWeb                     | `nnf anki review` / `nnf anki sync` |
| 标签增删、替换与清理                       | `nnf anki tags`                     |
| 媒体查询、读取、写入与删除                 | `nnf anki media`                    |
| 集合统计与复习历史                         | `nnf anki stats`                    |
| 编辑、创建和牌组管理 GUI                   | `nnf anki gui`                      |

## 工作流

### 复习

优先运行 `nnf anki review --deck <name> --limit <count> --include-new`。它按序同步、取卡、展示问题、从 stdin 接收 1–4 评分并汇总；输入 `q` 或 EOF 结束。需要单步控制时使用：

1. `nnf anki sync`
2. `nnf anki cards due --deck <name>`
3. `nnf anki cards present --card-id <id>`，确认后加 `--answer`
4. 用户确认评分后运行 `nnf anki cards rate --card-id <id> --rating <1-4>`

每次评分使用本次查询所得 card ID，并由用户确认评分。会话结束后运行 `nnf anki sync` 完成收尾同步。

### 建卡

1. `nnf anki models fields --name <model>` 确认字段；第一字段是排序字段且必须非空。
2. `nnf anki decks list` 确认牌组，不存在时运行 `nnf anki decks create --name <deck>`。
3. 单张使用 `nnf anki notes add --deck <deck> --model <model> --field Front=<text> --field Back=<text>`；批量使用 `nnf anki notes add-batch --deck <deck> --model <model> --input -` 并从 stdin 提供 JSON。
4. 需要用户在 Anki 中手动确认时使用 `nnf anki gui add-cards`，并按 leaf help 提供命名 options。

新增成功后，以返回的 note ID 运行 `nnf anki notes info --note-id <id>` 复核字段。

### 查询后修改

先用 `nnf anki notes find --query <anki-query>` 获取 ID，再以 `nnf anki notes info --note-id <id>` 核对目标，最后用 `nnf anki notes update --id <id> --field <name=value>` 修改。每个被修改的 ID 都应来自本次会话的查询结果。

## 安全与语义

- 永久删除笔记、删除笔记类型字段、清理未使用标签和删除媒体前，先取得用户确认，再按 leaf help 使用 `--yes`。
- `nnf anki notes update` 的目标正在 Anki 浏览器中打开时可能静默失败；更新前让用户关闭浏览器或切走，并在结果异常时先检查这一点。
- `sync` 依赖桌面端已经登录 AnkiWeb。
- `nnf anki gui` 只用于编辑、创建与牌组管理；复习使用 `nnf anki review` 或 `nnf anki cards`。
- 统计结果中的 counts 表达今日学习队列，states 表达不受日期和上限影响的真实状态计数。
- `nnf anki media store --file <path>` 限制媒体 MIME；URL 默认拒绝私网和环回地址；文件名会防御路径穿越。例外由 `MEDIA_ALLOWED_TYPES`、`MEDIA_IMPORT_DIR`、`MEDIA_ALLOWED_HOSTS` 控制。
- `--read-only` 或 `READ_ONLY=true` 阻止集合写入，但保持复习评分与同步能力。
