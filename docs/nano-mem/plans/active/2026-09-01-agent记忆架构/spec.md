---
status: completed
---

# Agent 记忆架构

## 问题

需要从零交付 npm 包 `@kxh4892636/nano-mem`：它以 `nnm` CLI 提供本地记忆存储、全文检索、使用强化与软遗忘，并随包分发 `nano-mem` agent skill。系统必须在不使用 LLM、embedding、向量模型或向量数据库的前提下，可靠检索中文自然短语与代码标识符；高频实际使用的记忆更难遗忘，长期不用的记忆从默认搜索隐藏但可恢复。

CLI 还要管理随包分发的受管 skill，并以事务式 `nnm self update` 保持 CLI 与已安装 skill 版本一致。所有数据保存在单个用户级 SQLite 数据库；默认 project 标识是 Git 根目录名，同名项目有意共享记忆空间。

## 方案

采用一个短进程、同步 I/O 的 TypeScript CLI。agent skill 是策略面，负责提炼原子记忆、搜索语义冲突并选择明确命令；CLI 是机制面，通过窄服务接口组合 SQLite、FTS 查询、FSRS 生命周期和 self 管理。

```text
nano-mem skill
      │ stable JSON
      ▼
nnm command handlers
      ├── MemoryService ── ScopeResolver
      │        ├────────── SQLiteMemoryStore + FTS5
      │        └────────── RetentionPolicy + RankPolicy
      └── SelfService ──── ManagedSkillStore + PackageUpdater
```

存储与 FTS 由同一个 SQLite 事务维护；不建立 provider/factory 体系。时间、文件系统路径、Git 根目录解析和包更新执行器作为外部 seam 注入，以便测试生命周期、安装回滚和跨平台路径。

## 已排除的备选

- embedding 或向量搜索：引入模型、索引服务和不可解释依赖，违背本地全文检索边界。
- 把 LLM 抽取放进 `nnm add`：使命令结果依赖模型和网络；语义提炼属于 skill。
- 每个 workspace 一个数据库：global 记忆难以共享，并产生多库迁移与维护成本。
- search 返回即增强稳定性：会形成排名自强化回路；search 与 use 必须分离。
- 后台调度遗忘：扩大部署、并发和故障面；生命周期在读取时惰性求值。
- 直接使用默认 `unicode61` 或仅使用 `trigram`：前者不能命中连续中文子串和 camelCase 部分，后者不能命中两字符中文。
- 引入完整闪卡调度状态机：due、learning/relearning steps、评分和 fuzz 不属于记忆领域。

## 实施决策

### 包与公开契约

- 新包位于 `packages/nano-mem`，npm 名称为 `@kxh4892636/nano-mem`，只暴露 `nnm` bin，Node engine 与工作区保持 `>=22.12.0`。
- 使用 Commander 解析命令；stdout 只输出成功 JSON，stderr 只输出错误 JSON。成功 envelope 为 `{ "ok": true, "data": ... }`；失败为 `{ "ok": false, "error": { "code", "message", "hint"? } }`。
- 退出码 `0` 表示成功，`1` 表示运行时失败，`2` 表示用法错误；`--pretty` 只改变缩进，不改变字段。
- `add`/`update` 的 content 可来自位置参数或 stdin，二者同时提供时返回用法错误。所有用户查询先转成 FTS 参数，不把原始文本拼接进 SQL 或 MATCH 语法。
- 记忆命令为 `add/search/use/get/list/update/forget/restore/delete`；self 命令为 `self skill status/install/update/uninstall` 与 `self update`。

### 数据位置与作用域

- `NANO_MEM_HOME` 指向数据目录；未设置时使用 OS 用户数据目录下的 `nano-mem`。数据库文件名为 `nano-mem.db`。
- Windows 默认 `%LOCALAPPDATA%/nano-mem`，macOS 默认 `~/Library/Application Support/nano-mem`，Linux 默认 `${XDG_DATA_HOME:-~/.local/share}/nano-mem`。
- project 标识解析顺序为：显式 `--project` → Git 根目录 basename → cwd basename。global 记忆没有 project 标识。
- `add` 默认 project；`search` 默认 current project + global。`--scope project|global|all` 明确覆盖查询范围，写命令只接受 project 或 global。

### SQLite schema

数据库使用 `PRAGMA user_version` 做前向 migration，并启用 foreign keys、WAL 与 busy timeout。公共 ID 使用 `crypto.randomUUID()`；内部整数 rowid 用于 FTS external-content 关联。

```text
memories
  id TEXT UNIQUE NOT NULL
  content TEXT NOT NULL
  identity_text TEXT NOT NULL
  content_hash TEXT NOT NULL
  search_terms TEXT NOT NULL
  source TEXT NULL
  scope TEXT CHECK(project|global)
  project_id TEXT NOT NULL              # global 使用空字符串
  created_at_ms INTEGER NOT NULL
  updated_at_ms INTEGER NOT NULL
  policy_version INTEGER NOT NULL
  stability REAL NOT NULL
  difficulty REAL NOT NULL
  retention_anchor_at_ms INTEGER NOT NULL
  natural_forget_at_ms INTEGER NOT NULL
  explicit_forgotten_at_ms INTEGER NULL
  last_used_at_ms INTEGER NULL
  use_count INTEGER NOT NULL DEFAULT 0
  retrieval_count INTEGER NOT NULL DEFAULT 0
  UNIQUE(scope, project_id, content_hash)

memories_fts(content, search_terms, content='memories', content_rowid='rowid')
```

- `identity_text` 由 NFKC、首尾裁剪和连续 Unicode whitespace 折叠得到，但保留大小写与标点；其 SHA-256 用于同 scope 精确幂等去重。
- FTS 表通过同事务 trigger 与 `memories` 同步；repository migration 必须能重建索引。
- v1 不保存任意 metadata、历史快照或事件日志；计数和生命周期字段是当前状态的唯一事实源。

### 全文候选与排序

- `search_terms` 使用 NFKC lowercase 规范化。CJK 连续文本生成 1–3 字符 n-gram；英文和数字保留完整 token，并按 camelCase、snake_case、kebab-case、文件路径和扩展名边界追加分段 token。
- 查询使用相同 tokenizer，把生成 token 作为转义后的 FTS5 `unicode61` MATCH 项；这使两字中文、较长中文短语、英文、路径和标识符部分都由 FTS 产生候选。
- FTS 按 BM25 over-fetch 最多 50 个当前作用域内的活跃候选；默认返回 10 个，`--limit` 最大 50。
- BM25 候选分数在本次候选集内归一化。最终分数为 `lexical * (1 + lifecycleBoost)`，其中 boost 使用黄金比例的 38.2% 总上限，并保持 40%/40%/20% 的信号分配：可检索性最多 15.28%，`log1p(use_count)` 最多 15.28%，`log1p(retrieval_count)` 最多 7.64%。计数分量在 100 次时达到上限。
- 只有最终返回的结果在同一写事务中增加 `retrieval_count`；`get/list` 不增加。无 FTS 候选时返回空数组且不报错。

### FSRS 生命周期

- 本地 `RetentionPolicy` 采用 `.temp/ts-fsrs` 的 FSRS-6 默认 21 个参数与公式，固定为 `policy_version = 1`；不依赖完整 `ts-fsrs` runtime，并在第三方声明中注明公式与参数来源。
- 新增、内容更新或恢复使用固定 Good 初始状态：初始 stability 为 `2.3065` 天，difficulty 由 FSRS-6 Good 公式计算。实际 `use` 作为固定 Good 成功事件，以未取整的连续 elapsed days 更新 stability/difficulty。
- 可检索性使用 `R(t,S) = (1 + factor × t/S)^decay`，其中 `decay = -0.1542`、`factor = exp(ln(0.9)/decay)-1`。自然软遗忘阈值固定为 `R < 0.5`；未使用的新记忆约 208 天后越过阈值。
- `natural_forget_at_ms` 是由 stability、anchor 和阈值推导的查询优化字段；有效状态仍由当前时间与显式遗忘覆盖共同决定。
- `use` 只接受活跃记忆，产生使用事件并更新 stability、difficulty、anchor、last-used、use-count 和自然遗忘时间。相同时间戳的重复 use 仍累计 use-count，但不伪造 elapsed time。
- `forget` 设置显式遗忘时间；自然或显式软遗忘都从 search 隐藏。`get/list` 展示 `active|forgotten` 与 `natural|explicit` 原因。
- `restore` 保留 ID/content/source/scope/created-at，清空显式原因并将全部生命周期与热度统计重置为新记忆状态；它不产生 use。软遗忘记忆直接 `use` 返回稳定领域错误。
- content 改变的 `update` 重置生命周期与热度；只改变 source 时保留生命周期。`delete --force` 才物理删除。

### Agent skill

- 包内只分发一个 `nano-mem` skill。它在任务开始前构造少量明确查询并调用 search；实际采用后调用 use；形成可复用结论时提炼一条原子记忆。
- 新增前先 search：精确重复交给 add 幂等处理；语义重复或冲突由 agent 明确选择 add、update、forget 或 delete，CLI 不猜测。
- skill 不自动捕获整段会话、不接 hooks、不运行后台维护；空检索结果保持静默，不把 CLI JSON 或生命周期统计原样注入工作上下文。

### Self 管理与分发

- build-time manifest 记录包内 `nano-mem` skill 的版本、文件清单与内容哈希。默认 target root 是 `<cwd>/.agents/skills`，可用 `--target` 覆盖。
- `self skill status` 返回 `not_installed|current|outdated|modified`；install/update/uninstall 支持 `--dry-run`，遇到 modified 时拒绝，只有 `--force` 可覆盖或卸载。
- `self update` 默认选择 npm 最新稳定版，可用 `--version <semver-or-tag>` 指定。它先生成计划并可预演，再更新全局 CLI 包和当前 target 下已安装的 skill；skill 未安装时不隐式安装。
- CLI 包更新与 skill 同步视为一个可补偿事务：保留旧包版本与 skill backup，任何一步失败都回滚；modified skill 没有 `--force` 时在变更前失败。
- 发布内容只包含 dist、skills、README、LICENSE 和 THIRD_PARTY_NOTICES。分发验收使用临时 npm prefix 与临时 target，不修改开发机真实全局安装。

## 工作环境

- 工作区使用 pnpm `11.22.0`、Vite Plus 与 TypeScript，根 Node engine 为 `>=22.12.0`；现场 Node 为 `v24.19.0`。
- 本机已验证 `node:sqlite` 可创建 FTS5 表并调用 `bm25()`；还验证了 `trigram` 的两字中文缺口，因而采用显式 search-term tokenizer。
- 包级命令沿用 `vp check`、`vp test`、`vp pack`，并通过工作区递归任务验证集成影响。
- clean main 已证实根 `pnpm ready` 在本任务前不可用：全仓存在 816 个既有格式问题，且递归并行测试在 Windows Git/MSYS 下触发共享内存失败。最终替代门禁为 changed-scope `check`，再执行全仓 `vp run -r --concurrency-limit 1 build` 与 `vp run -r --concurrency-limit 1 test`；既有失败只作为基线证据，不批量格式化无关文件。
- 测试通过公开 CLI/service seam 使用临时目录、内存或临时 SQLite、可注入 clock 与伪 package executor；不触碰用户真实数据库、skill 目录或全局 npm prefix。

## 执行契约

- 按依赖顺序串行自动交付全部 issues：`01 → 02 → 03 → 04 → 05 → 06 → 07`；每个 issue 的实现、测试和验证通过后记录 receipt 并自动领取下一个，只有真实 blocker、门禁失败或基线实质漂移才暂停。
- 实现在独立 worktree `C:/Users/kxh/kxh-awesome/projects/kxh-kit-nano-mem-v1` 的分支 `worktree/nano-mem-v1-20260902` 中进行；现有 `feat/nano-mem` worktree 与任何旧 Nano Mem 内容不作为事实来源且保持不动。
- 当前已确认的领域与 Plan 变更安全转移到新 worktree 后再开始实现。固定比较点为 `main@5cd31ee6e96f294586db0a0daa00d5071c7ac5fc`；不覆盖无关工作树变更。
- 每个完成 issue 在 feature branch 形成可恢复 commit。全部 Plan 门禁通过后以 fast-forward 方式合入本地 `main`；若远端推进导致不能 fast-forward，则重新同步、重验受影响门禁，不 force push。
- 合入后从本地 tarball 全局安装 `nnm` 到当前 npm prefix `C:/nvm4w/nodejs`，再从仓库根以 `nnm self skill install --target .agents/skills --force` 安装已确认要替换的本地 `nano-mem` skill；不发布 npm 包。
- 本地 CLI 与 skill 安装完成后执行真实 smoke 和替代后的完整门禁；将安装产生的受管 skill 工作区变更形成最终 commit，并 push `origin main`。不推送 feature branch，不删除或改写其他 worktree/branch。
- push 成功且 `origin/main` 指向已验证提交后，才移除本次专用 worktree；现有其他 worktree 保持不动。

## 范围

- 创建并接入 `packages/nano-mem`、`nnm` bin、README、许可证与第三方声明。
- 实现 SQLite schema/migration、scope、精确去重、CRUD、FTS search、排序、检索计数、FSRS use、软遗忘与恢复。
- 实现稳定 JSON/错误/退出码契约和全部已确认命令。
- 创建并分发 `nano-mem` skill。
- 实现受管 skill 状态与安全变更，以及事务式 CLI 自更新。
- 为中文、英文、路径、标识符、生命周期、作用域、回滚和分发编写可复核测试。

## 非范围

- LLM、embedding、向量数据库、reranker provider 或 hosted API。
- user/agent/session/run scope、任意 metadata/filter DSL、tag、pin、history/rollback、导入导出、批处理。
- session hooks、全量对话捕获、daemon、cron 或后台清理。
- FSRS 四级评分、Again/Hard/Easy、due、learning/relearning steps、复习会话或参数训练。
- 自动语义去重、冲突合并或无确认的永久删除。

## 待定

无。公式常数、schema、命令面、状态机、self 更新边界和 issue 依赖均已具体化，等待用户统一审阅。

## 上下文

- [story.md](story.md)
- [Nano Mem 领域语言](../../../CONTEXT.md)
- [ADR 0001：分离 skill 策略面与 CLI 机制面](../../../adr/0001-分离skill策略面与cli机制面.md)
- [ADR 0002：采用全文候选与生命周期重排](../../../adr/0002-采用全文候选与生命周期重排.md)
- [ADR 0003：在单用户数据库中划分记忆作用域](../../../adr/0003-在单用户数据库中划分记忆作用域.md)
- [ADR 0004：采用可恢复软遗忘与惰性评估](../../../adr/0004-采用可恢复软遗忘与惰性评估.md)
- `.temp/mem0`：直接 CLI、skill/CLI 分层、精确去重和检索候选架构参考。
- `.temp/ts-fsrs`：FSRS-6 stability、difficulty、forgetting curve 与 Good 成功事件公式参考。

## Issue

| #   | Issue                                                          | 状态      | 阻塞于 | 下一步         |
| --- | -------------------------------------------------------------- | --------- | ------ | -------------- |
| 01  | [建立 Nano Mem 包与 CLI 契约](01-建立nano-mem包与cli契约.md)   | completed | —      | /code-delivery |
| 02  | [交付作用域化记忆存储与维护](02-交付作用域化记忆存储与维护.md) | completed | 01     | /code-delivery |
| 03  | [交付中文与代码全文检索](03-交付中文与代码全文检索.md)         | completed | 02     | /code-delivery |
| 04  | [交付使用强化与软遗忘](04-交付使用强化与软遗忘.md)             | completed | 03     | /code-delivery |
| 05  | [闭合 Nano Mem agent skill](05-闭合nano-mem-agent-skill.md)    | completed | 04     | /code-delivery |
| 06  | [交付受管 skill 自管理](06-交付受管skill自管理.md)             | completed | 01、05 | /code-delivery |
| 07  | [交付事务式自更新与分发验收](07-交付事务式自更新与分发验收.md) | completed | 06     | /code-delivery |
