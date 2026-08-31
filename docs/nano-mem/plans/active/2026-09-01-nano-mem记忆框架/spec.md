---
status: pending
---

# nano-mem 记忆框架

## 问题

为 agent 实现一级记忆框架：`nano-mem` skill + `nm` CLI。记忆用 SQLite + FTS5 存储与全文检索（无向量模型），以 FSRS 机制让高频使用的记忆更牢固、检索优先级更高，长期不用的记忆被遗忘；skill 随 CLI 包分发并经 `nm self skill` 管理。核心诉求是「cli api 设计简单直接」。

## 方案

TypeScript 包 `@kxh4892636/nano-mem`（bin `nm`），用 Node 内置 `node:sqlite`（FTS5）做存储与检索，唯一运行时依赖 `ts-fsrs`（纯长时调度）。CLI 提供 8 个记忆命令 + `self skill` 管理命令；skill 内置在包内 `skills/nano-mem/`，安装到目标工作区 `.agents/skills`，模式沿用 loopx 的同版发布设计。记忆状态按「活跃 → 休眠 → 已删」三态在查询与 `nm gc` 时惰性判定。

## 已排除的备选

- 向量/语义检索：引入 embedding 与部署依赖（ADR-0001）。
- `better-sqlite3`：原生编译依赖；`node:sqlite` 已实测 FTS5/bm25 可用（ADR-0001）。
- 后台调度任务清理遗忘；硬删除；纯时间衰减（ADR-0002）。
- 只显式记账 / 检索全记 Good：记账失真或依赖 agent 自律（story US-003 采用弱/强双通道）。
- LLM 事实抽取、history 事件流、`nm edit`、独立 `nm purge`：v1 非范围（故事集闭合时确认）。
- skill 独立语义版本：版本矩阵与发布协调（nano-mem ADR-0003）。
- 每工作区独立 db 文件：用户级全局库 + agent/run 分区（story 已确认）。

## 实施决策

### 包与工具链

- `packages/nano-mem`：name `@kxh4892636/nano-mem`、license MIT、type module；bin `{ "nm": "dist/main.mjs" }`；`files: [dist, skills, LICENSE, README.md]`。
- 依赖 `ts-fsrs ^5.4.1`（零运行时依赖；`enable_short_term: false` 启用纯长时调度，即记忆场景）；devDeps 走 catalog（typescript/vite-plus/vitest/@types/node/@typescript/native/@vitest/coverage-v8）。
- scripts：`build: vp pack src/main.ts`、`test: vp test`、`check: vp check`。
- `engines: ">=24.0.0"`（`node:sqlite` FTS5 支持实测于 v24.19；ADR-0001）。

### 存储 schema（store.ts）

```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,          -- sha256(text)
  agent TEXT NOT NULL,
  run_key TEXT NOT NULL DEFAULT '', -- run ?? ''
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  meta TEXT NOT NULL DEFAULT '{}',  -- JSON object
  state TEXT NOT NULL DEFAULT 'active',  -- 仅显式转移：delete → trashed
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_review TEXT,
  due TEXT,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  fsrs_state INTEGER NOT NULL DEFAULT 0, -- ts-fsrs Card.state
  trashed_at TEXT,
  UNIQUE(agent, run_key, text_hash)
);
CREATE VIRTUAL TABLE memories_fts USING fts5(text_tok, content='', tokenize='unicode61');
-- rowid = memories.id；add/delete 由代码同步 FTS（v1 无文本更新路径）
```

- FTS 预处理（写入与查询同构）：CJK 汉字两侧插入空格 + lowercase；FTS5 trigram 因 ≤2 字中文查询失败而排除（story 上下文实测记录）。
- 文本去重：同 agent + run_key + text_hash 唯一；重复 add 返回既有 id。

### FSRS 封装（fsrs.ts）

- `createMemoryScheduler()` → `fsrs({ enable_short_term: false })`；`initialCard()` → `createEmptyCard()`。
- `recordUse(card, grade, now)` → `next(card, now, Grade)` 返回新 card；`retrievability(card, now)` → `get_retrievability(card, now)`。
- 记忆最初以 Good 初始化（`createEmptyCard` 后首次 `next(card, now, Good)` 建立 S0/D0——ts-fsrs 需要首次复习推进 New→Review）；首次 add 即执行初始化复习。

### 检索评分

- `score = w_rel × rel + w_strength × R`，默认 `w_rel=0.65, w_strength=0.35`（`--score-weights` 可覆盖）；`rel = 1 / (1 + exp(bm25))`（bm25 为负，越接近 0 越相关）；`R = retrievability()`。
- 默认 `--min-score 0.35`；过滤按 score 与状态（见下）。

### 遗忘状态机（惰性）

- 持久化 `state` 只表达显式转移：`nm delete` → `trashed`（记 trashed_at）。
- 查询时计算有效状态：`trashed`（state=trashed）→ 默认全部结果中隐藏（`--include-dormant` 不含 trashed）；R < 0.35 → 休眠（默认隐藏，`--include-dormant` 可见）；其余为活跃。
- `nm gc --dry-run`：扫描全部记忆，R < 0.10 或休眠超过 180 天 → 标 `trashed`；清除 trashed 超过默认 30 天（`--retention-days`）的记录（物理删除 + FTS 同步）。

### CLI 契约

- 命令：`add/search/get/list/use/delete/gc/stats` + `self skill list|check|install|update|uninstall`。
- 全局选项：`--json`（stdout 成功 JSON / stderr 错误 JSON；退出码 0 成功 / 1 运行时错误 / 2 用法错误）、`--db <path>`（默认 `NANO_MEM_DB` → `~/.nano-mem/mem.db`）、`--agent`（默认当前工作目录名）、`--run`、`--dry-run`（写命令预演）、`--help`/`--version`。
- 默认输出为人类可读文本；错误带 `hint` 时优先展示。

### self skill 管理（self.ts）

- 默认 target `<cwd>/.agents/skills`；包内 skill 来源 `skills/nano-mem/`。
- marker `.nano-mem-managed.json` `{ name, version, contentHash }`；状态 `not_installed | current | outdated | modified`。
- `install/update/uninstall`：prepare → preview（`--dry-run` 只出 preview）→ commit 事务（staged + backup + 回滚）；update/uninstall 遇 `modified` 需 `--force`；version 取自包 `package.json`（与 CLI 同版，nano-mem ADR-0003）。

### skill 与文档

- `skills/nano-mem/SKILL.md`：frontmatter（name: nano-mem + description）；契约段（`nm --help` 为事实源、`--json`、退出码）；何时 add/search/use；记忆三态与遗忘语义。
- `README.md`：US-007 使用文档（命令参考、NANO_MEM_DB、JSON 契约、退出码）。

## 工作环境

- 工作区 pnpm@11.22.0、Node ≥ 24.0.0（本机 v24.19，node:sqlite FTS5 已实测）；仓库工具链 vite-plus（`vp pack`/`vp test`/`vp check`）+ vitest。
- 领域校验：`node .agents/skills/loop-x/script/check-domain.mjs .`。
- 全局安装验证：`npm i -g <包产物>` 或 `npm pack` 后安装 tarball。

## 范围

- 包、存储与检索、FSRS 记账、CLI 全命令、遗忘状态机、skill + README、self skill 管理、端到端冒烟（README 用法全链路）。
- 单测覆盖存储/FTS/FSRS/评分/状态机/self 事务；验收见各 issue。

## 非范围

- LLM 事实抽取、向量/语义检索、history 事件流、后台调度任务、`nm edit`、独立 `nm purge`。
- DSH 插件封装（nano-mem 是独立工具；skill 以 DSH 内建一层形态被发现，见 CONTEXT-MAP）。
- config 文件与三方服务（无配置文件；仅环境变量 `NANO_MEM_DB`）。

## 待定

无。

## 上下文

- [story](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/story.md) — 7 个故事与验收
- [CONTEXT](../../../docs/nano-mem/CONTEXT.md) — 领域术语
- [ADR-0001](../../../docs/nano-mem/adr/0001-存储与检索采用sqlite与fts5无向量模型.md)
- [ADR-0002](../../../docs/nano-mem/adr/0002-遗忘三态状态机与惰性判定.md)
- [ADR-0003](../../../docs/nano-mem/adr/0003-skill与cli同版发布并经self命令管理.md)
- [quest 审阅](../../../../.flow/quest/2026-09-01-nano-mem记忆框架.md)
- `packages/loopx/src/builtins/self/` 与 `packages/loopx/skills/`：self skill 管理参考实现（事务/回滚/marker/hash）
- `.temp/ts-fsrs/` 与 `.temp/mem0/`：FSRS 与 mem0 架构参考
- README 使用文档要求（story US-007）

## Issue

| #   | Issue                                                      | 状态    | 阻塞于 | 下一步         |
| --- | ---------------------------------------------------------- | ------- | ------ | -------------- |
| 01  | [项目脚手架与记忆库存储层](01-项目脚手架与记忆库存储层.md) | pending | —      | /code-delivery |
| 02  | [FSRS 调度接入](02-fsrs调度接入.md)                        | pending | —      | /code-delivery |
| 03  | [CLI 命令集与记忆管理命令](03-cli命令集与记忆管理命令.md)  | pending | 01,02  | /code-delivery |
| 04  | [检索排序与遗忘状态机](04-检索排序与遗忘状态机.md)         | pending | 03     | /code-delivery |
| 05  | [nano-mem skill 与 README 使用文档](05-skill与使用文档.md) | pending | 04     | /code-delivery |
| 06  | [self skill 管理](06-self-skill管理.md)                    | pending | 05     | /code-delivery |
| 07  | [端到端冒烟验证](07-端到端冒烟验证.md)                     | pending | 06     | /code-delivery |
