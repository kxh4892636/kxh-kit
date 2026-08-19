---
name: anki-cli
description: 通过 AnkiConnect 操作本机 Anki 的命令行工具. 触发: 用户要求增删改查笔记/卡片/牌组/标签/媒体/模板, 复习到期卡片, 或查询 Anki 统计——任何 Anki 数据任务.
---

# anki-cli

`anki-cli` 是操作本机 Anki 的 CLI(经 AnkiConnect, 默认 `http://localhost:8765`)。本 skill 只携带 agent 无法从 environment 低成本获取的内容:**流程**与**陷阱**。命令全表与参数细节以 environment 为单一事实来源, 现场检索, 不凭记忆:

- `anki-cli --help` / `anki-cli <group> --help` — 命令与参数;
- `packages/anki-cli/README.md` — 完整命令表、配置、安全说明;
- `docs/anki-cli/CONTEXT.md` — 领域术语(笔记/卡片/牌组/笔记类型/评分);
- `docs/anki-cli/smoke-checklist.md` — 真实 Anki 验收清单。

在本工作区运行前先构建一次: `vp run @kxh4892636/anki-cli#build`, 之后用 `node packages/anki-cli/dist/main.mjs <命令>`(或 `--anki-connect <url>` 覆盖地址; 全局选项可放子命令前后)。

## 全局契约(每条命令都遵守)

- **JSON 契约**: stdout 只有结果 JSON(默认 2 空格缩进, `--compact` 单行); stderr 只有错误对象 `{success:false, error, action?, hint?, ...}`; 退出码 0=成功、1=运行时错误、2=用法错误。管道组合天然可用(`... | jq .cards`)。
- 失败先看错误 JSON 的 `hint` —— 它携带修复路径(如牌组不存在 → `decks list` 查名)。
- 拿不准参数时用 `<group> --help` 现场确认, 再执行。

## 流程

### 复习闭环

用户要复习时, 优先用交互式 `review` 命令, 不要手工拼 due/present/rate:

```
anki-cli review [--deck <n>] [--limit <n>] [--include-new] [--no-sync]
```

它按序完成 sync → 拉取到期卡片 → 逐张输出问题 JSON → stdin 收评分(1-4; q 退出)→ 输出评分结果与汇总。**完成标准**: 用户表示结束时, 若会话内没有做过收尾 sync, 补一次 `anki-cli sync`(上游语义: 会话开始与结束都要 sync)。

需要单步控制时, 手工闭环: `sync` → `cards due --deck <n>` → `cards present <id>`(先问、`--answer` 后答)→ 用户确认评分后 `cards rate <id> <1-4>`。**完成标准**: 每次评分都经用户确认; 卡片 ID 在 rate 前已由 due/present 验证存在。

### 建卡流程

1. `models fields <类型>` 确认字段(排序字段=第一字段, **必须非空**);
2. `decks list` 确认牌组存在, 不存在先 `decks create`;
3. 单张: `notes add --deck <n> --model <n> --field Front=... --field Back=... [--tag ...]`; 批量(优先): `notes add-batch --deck <n> --model <n>`, 笔记数组经 **stdin JSON** 读入;
4. 要用户在 GUI 里确认时改用 `gui add-cards --deck --model --field ...`。

**完成标准**: 命令返回 `success:true` 与 noteId, 且用 `notes info <id>` 复核字段内容与排序字段非空。

### 查询与修改流程

- 先查后改: `notes find <query>`(Anki 查询语法)→ `notes info <ids...>` 拿 ID 与字段, 再 `notes update <id> --field k=v...`。
- 卡片: `cards due`(今日到期)/ `cards list --state new|due|learning|suspended|buried`; front/back 是按卡片模板渲染后的文本, 反转卡与 cloze 方向正确, 可直接展示给用户。

**完成标准**: 修改命令使用的每个 ID 都来自本次会话内的查询结果, 而非记忆。

## 规则与陷阱

- **破坏性命令一律要 `--yes`**: `notes delete`(笔记连同全部卡片永久删除)、`models field-remove`(字段数据全部删除)、`tags clear-unused`、`media delete`。不加 `--yes` 时命令拒绝执行并给出 warning; 不要替用户补 `--yes`, 先向用户确认。
- **`notes update` 的浏览器坑**: 目标笔记正在 Anki 浏览器中打开时, 更新会静默失败(返回 200 但字段不变)。更新前提示用户关闭浏览器或切走; 结果 JSON 的 `warning` 字段始终提示这一点, 若用户反映「没变」, 先查这个。
- **`sync` 依赖桌面端已登录 AnkiWeb**, 失败时 error 会带登录提示。
- **GUI 组(`gui *`)只用于编辑/创建与牌组管理流程**: 打开浏览器/编辑器/对话框给用户手动操作。复习编排一律用 `review` 或 `cards` 组。
- **stats 的两个视角, 不要混用**: `counts` 是**今日学习队列**(今日到期、受每日上限, 牌组浏览器同款数字); `states` 是**真实状态计数**(不受日期与上限影响)。问「今天学什么」看 counts, 问「各状态有多少卡」看 states。`decks stats <deck>` 两者都给, `stats collection` 的 per_deck 是 counts 视角。
- **媒体安全**: `media store --file` 只收媒体 MIME 类型, `--url` 拒私网/环回地址(SSRF), 文件名自动净化路径穿越; 需要例外时用 `MEDIA_ALLOWED_TYPES`/`MEDIA_IMPORT_DIR`/`MEDIA_ALLOWED_HOSTS`。
- **只读模式**: `--read-only`(或 `READ_ONLY=true`)拦截全部写操作, 复习与 sync 放行; 适合只浏览不修改的场景。
- **模型字段操作有预检**: `models field-add/rename/reposition` 会先核对现有字段(重名、大小写变体、越界 index 都会在写前拒绝), 错误 JSON 的 hint 给出正确做法。
