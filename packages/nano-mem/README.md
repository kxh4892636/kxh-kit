# nano-mem

`nano-mem` 是 agent 的长期记忆 CLI（bin `nm`）：把可复用的结论（决策、偏好、踩坑、事实）存进用户级全局记忆库，用 SQLite + FTS5 全文检索（无向量模型），以 FSRS 调度维持「使用 → 增强 → 优先级 → 遗忘」闭环——高频使用的记忆更牢固、检索排名更高，长期不用的记忆自动衰减为休眠，直至被 `nm gc` 清理。

- 记忆命令（8 个）：`add` / `get` / `list` / `use` / `delete` / `stats` / `search` / `gc`
- 记忆三态：活跃（active）→ 休眠（dormant）→ 已删（trashed），查询与 gc 时惰性判定，无后台任务
- 随包分发 `nano-mem` skill（`skills/nano-mem/SKILL.md`），供 agent 按使用纪律读写（见文末说明）

## 安装

要求 Node ≥ 24（依赖内置 `node:sqlite` 的 FTS5）。

发布后全局安装：

```sh
npm i -g @kxh4892636/nano-mem
nm --version
```

本地开发安装（本仓库，先构建再打包）：

```sh
pnpm --filter @kxh4892636/nano-mem build   # 产出 dist/main.mjs
npm pack                                    # 在 packages/nano-mem/ 下生成 tarball
npm i -g ./kxh4892636-nano-mem-0.1.0.tgz
```

## 快速开始

首次运行自动创建默认库（`~/.nano-mem/mem.db`），无需任何初始化：

```sh
nm add "用户偏好：命令实现优先用 node:sqlite" --tag preference --meta importance=high
nm search "sqlite"          # 命中自动记一次弱使用（Hard）
nm use 1 --grade good       # 记忆实际用于回答后，升级为强使用
nm stats                    # 总数 / 状态分布 / FSRS 概览
nm gc --dry-run             # 预览遗忘清理；确认后去掉 --dry-run 执行
```

## 命令参考

以下与 `nm --help` 输出逐项一致（命令名/选项名/默认值）。所有命令支持全局选项（见[全局选项](#全局选项)）。

### nm add <text>

```sh
nm add "SQLite FTS5 支持 CJK 分词的全文检索" --tag tech --meta importance=high
echo "流水线结论" | nm add -        # 文本为 "-" 时从 stdin 读取
nm add "..." --dry-run             # 预演，不写入
```

- 文本为一个或多个位置参数（`nm add` 后按空格拼接）；`-` 表示从 stdin 读取。
- 选项：`--tag <t>`（可重复）、`--meta <k=v>`（可重复）。
- 记忆归属当前 `--agent` 分区（默认当前目录名），同 agent + run 分区内同文本自动去重，重复添加返回既有 id。
- 首次写入按 Good 使用评级初始化 FSRS；`--dry-run` 输出预演计划。

### nm get <id>

```sh
nm get 1
```

读取记忆全文（文本、标签、元数据、agent/run、FSRS 调度字段）。id 不存在时报运行时错误（退出码 1）。

### nm list

```sh
nm list                       # 默认仅有效活跃记忆
nm list --state all           # 全部状态（含休眠/已删）
nm list --state dormant       # 仅休眠
nm list --agent kxh-kit --tag tech --limit 20
```

- 选项：`--agent <a>`、`--run <r>`（显式给出时按分区过滤）、`--tag <t>`（可重复）、`--state <s>`（可重复：`active` / `dormant` / `trashed` / `all`）、`--limit <n>`（正整数）。
- `--state` 语义为惰性判定：`active` = 非已删且 R ≥ 0.35；`dormant` = 非已删且 R < 0.35；`trashed` = 已删；`all` = 全部。

### nm use <id> [--grade again|hard|good|easy]

```sh
nm use 1                     # 默认 good
nm use 1 --grade easy        # 显式强使用
```

记录一次使用并按使用评级走 FSRS 复习（更新 stability/difficulty/due 等）。弱使用（`nm search` 命中自动记 Hard）与强使用（本命令）双通道；`--dry-run` 预演。

### nm delete <id>

```sh
nm delete 1
```

软删除：state → `trashed` 并记 `trashed_at`，FTS 索引同步移除；超期后由 `nm gc` 物理清除（不提供硬删命令）。

### nm stats

```sh
nm stats
```

记忆总数、按状态分布（active/trashed）、FSRS 概览（平均 stability/difficulty、总复习次数、平均可检索性）。

### nm search <query>

```sh
nm search "sqlite"
nm search "检索" --tag tech --include-dormant --limit 5
nm search "优先级" --min-score 0.5 --no-touch
nm search "去重" --score-weights rel=0.8,strength=0.2
```

- 全文检索（查询与写入同构：CJK 汉字两侧插入空格 + 小写），按 `score = 0.65 × rel + 0.35 × R` 降序；只返回 FTS 命中项，trashed 恒排除。
- 选项：`--limit <n>`（默认 10）、`--min-score <m>`（默认 0.35，取值 [0,1]）、`--no-touch`（关闭自动弱使用）、`--include-dormant`（显示休眠记忆）、`--score-weights rel=<w>,strength=<w>`（和为 1）、`--agent <a>`、`--run <r>`、`--tag <t>`（可重复）。
- 默认对返回的每条记忆记一次弱使用（Hard）；`--no-touch` 或 `--dry-run` 时为零记账。

### nm gc [--retention-days <n>]

```sh
nm gc --dry-run               # 预览：标删 + 清除列表
nm gc                         # 执行
nm gc --retention-days 60     # 已删记录保留 60 天
```

- 标删（state → trashed）：R < 0.10，或 R < 0.35 且距 last_review 超过 180 天。
- 清除（物理删除 + FTS 同步）：已删且 trashed_at 超过保留期（默认 30 天，`--retention-days <n>` 正整数覆盖）。

## 全局选项

| 选项          | 说明                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| `--json`      | 成功输出 JSON 到 stdout，错误输出 JSON 到 stderr                                     |
| `--db <path>` | 数据库路径（默认 `$NANO_MEM_DB` → `~/.nano-mem/mem.db`），目录自动创建               |
| `--agent <a>` | agent 分区（add 默认当前目录名；list/search 仅在显式给出时按分区过滤）               |
| `--run <key>` | run 分区键（可选的任务/会话子分区，如 DSH sessionId）                                |
| `--dry-run`   | 写命令（add/use/delete/gc）预演，不打开数据库、无副作用；search 下同时关闭自动弱使用 |
| `--help`      | 显示帮助                                                                             |
| `--version`   | 显示版本                                                                             |

### 环境变量

- `NANO_MEM_DB`：覆盖默认数据库路径 `~/.nano-mem/mem.db`；优先级为 `--db` > `NANO_MEM_DB` > 默认路径。

### 记忆分区（--agent / --run）

- **agent 分区**：记忆必属的分区，默认取当前工作目录名（工作区根时为仓库名），如 `kxh-kit`；`--agent` 显式覆盖（写入时生效，读取时作为过滤条件）。
- **run 分区**：可选的任务/会话子分区，与 agent 分区共同限定记忆归属；不指定时为空。

## JSON 契约与退出码

- `--json` 时成功输出单个 JSON 对象到 stdout；错误输出 JSON 对象到 stderr。
- 退出码：`0` 成功 / `1` 运行时错误 / `2` 用法错误。
- 默认输出为人类可读文本；错误含 `hint` 时优先展示 hint。

各命令成功 JSON 形状（`--json`）：

| 命令                                 | stdout JSON                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `add`                                | `{"id":3}`                                                                                           |
| `get`                                | `{"memory":{...}}`                                                                                   |
| `list`                               | `{"memories":[...]}`                                                                                 |
| `use`                                | `{"memory":{...}}`                                                                                   |
| `delete`                             | `{"id":1}`                                                                                           |
| `stats`                              | `{"total":1,"byState":{"active":1,"trashed":0},"fsrs":{...}}`                                        |
| `search`                             | `{"results":[{"id":1,"text":"...","score":0.68,"relevance":0.5,"strength":1,"state":"active",...}]}` |
| `gc`                                 | `{"dryRun":false,"report":{"scanned":1,"toTrash":[...],"toPurge":[...]}}`                            |
| 写命令 `--dry-run`（add/use/delete） | `{"dryRun":true,"operations":[{"op":"add"\|"use"\|"delete",...}]}`                                   |

错误 JSON（stderr，退出码 1 或 2）：

```json
{
  "error": {
    "code": "usage",
    "message": "未知命令 \"badcmd\"",
    "hint": "可用命令: add, get, list, use, delete, stats, search, gc（nm --help 查看）"
  }
}
```

## 遗忘语义

记忆按三态状态机衰减，状态在查询与 gc 时惰性计算，无后台任务：

- **活跃（active）**：R ≥ 0.35，默认可被检索到。
- **休眠（dormant）**：R < 0.35，默认检索隐藏；`nm search --include-dormant` 可见，`nm list --state dormant` 盘点。
- **已删（trashed）**：`nm delete` 软删除后的终态，恒不进检索结果；`nm gc` 清除超过保留期（默认 30 天）的已删记忆。

记忆随使用增强：`search` 命中自动记弱使用（Hard），`nm use` 显式记强使用——高频使用提高 stability 与检索排名，长期不用的记忆 R 衰减进入休眠直至被 gc 清理。「搜不到不代表没有」：目标记忆可能在休眠、已删，或属于其他 agent/run 分区，先 `nm list --state all` 盘点再下结论。

## self skill 管理（待 06 完善）

`nano-mem` skill 随 CLI 包分发（`skills/nano-mem/`），经 `nm self skill` 安装/更新/卸载到工作区 `.agents/skills`——命令详细说明与示例待 issue 06 补全。
