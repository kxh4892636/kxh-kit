# nano-mem 记忆框架

## 原始想法

> /to-story 阅读 .temp/mem0 了解 agent 记忆的原理的架构, 仿照 mem0 实现我的以下诉求
>
> 1. 实现 skill + cli 驱动的一级框架, cli api 设计简单直接
> 2. 记忆信息的存储+检索, 使用 sqlite + 全文搜索, 不需要向量模型 + 向量搜索
> 3. 参考 .temp/ts-fsrs 的 FSRS 机制, 每段记忆使用频率越高, 越不容易忘记, 被检索的频率和优先级更高; 长时间不用的记忆会被遗忘.
>
> skill 命名为 nano-mem, cli 命名为 nm

## 角色

- **开发者（人类用户）**：维护多个项目的编码工作；跨会话希望 agent 记住项目事实、偏好与踩坑，避免每次重复说明，并希望记忆库保持精炼。
- **Agent（coding agent）**：通过 `nano-mem` skill 调用 `nm` CLI；任务开始前检索相关记忆，任务中把值得记忆的内容写入库，把真正用上的记忆标记为强使用。

## 故事

### Epic：nano-mem 记忆框架

由 `nano-mem` skill 与 `nm` CLI 构成的一级记忆框架：sqlite + FTS5 存储检索（无向量），FSRS 驱动的「使用 → 增强 → 优先级 → 遗忘」闭环；skill 随 CLI 包分发，经 `nm self skill` 安装到工作区。

#### US-001 记忆写入与持久化

作为开发者，我想要 agent 把值得记住的事实/偏好/踩坑写入用户级全局记忆库，以便跨会话、跨任务复用，不用每次重复说明。

- [ ] `nm add <text>` 成功后，`nm stats` 计数增加且 `nm get <id>` 可读回原文
- [ ] 每条记忆强制归属 `agent` 分区（默认取当前工作目录名，工作区根时为仓库名，如 `kxh-kit`），可选 `run`、`tag`、`meta key=value`
- [ ] 相同文本在同 agent 下重复 `add` 不会新增记录（确定性去重，返回既有 id）
- [ ] 中文文本采用 FTS5 unicode61 + CJK 字符切分预处理（写入与查询同构），已实测 Node v24.19 下 `node:sqlite` FTS5/bm25 可用

#### US-002 全文检索（无向量）

作为开发者，我想要按关键字全文检索记忆并按相关性排序，以便快速找到过往结论。

- [ ] `nm search <query>` 返回按 score 降序的记忆（含中文 2 字词查询可命中），`--json` 输出供 agent 消费
- [ ] 支持 `--agent`/`--run`/`--tag` 过滤与 `--limit`/`--min-score`
- [ ] 排序分 `score = 0.65 × rel + 0.35 × R`：`rel` 为 FTS5 bm25 经 sigmoid 归一化，`R` 为 FSRS 即时可检索性；默认阈值 0.35，权重可用 `--score-weights` 覆盖

#### US-003 使用记账（FSRS 输入）

作为开发者，我想要记忆的「被使用」被记账，使高频使用的记忆越来越难以遗忘，让 FSRS 有真实输入。

- [ ] `nm search` 默认对返回的记忆记一次弱使用（Hard 评级）；`nm use <id> --grade easy|good|hard|again` 显式记强使用；`--no-touch` 关闭自动记账
- [ ] 每条记忆持久化 FSRS 字段（stability/difficulty/due/reps/lapses/state/last_review），由 `ts-fsrs` 包更新（直接依赖，零运行时依赖）

#### US-004 检索优先级与遗忘

作为开发者，我想要高频使用的记忆在检索时排名更高、长期不用的记忆自动降级直至清理，以便记忆库保持精炼可用。

- [ ] 对同一条记忆连续 `nm use`（good/easy）后，相同查询下其排名上升或不降（S 单调上升 → R 衰减慢 → score 更高）
- [ ] 三态状态机：活跃 `active`（默认可搜）→ 休眠 `dormant`（R < 0.35 自动隐藏，`--include-dormant` 可见）→ 已删 `trashed`（R < 0.10 或休眠超过 180 天，`nm gc` 标删并清除超期已删记录）
- [ ] 状态判定在查询与 `nm gc` 时惰性计算；`nm gc --dry-run` 可预览清理计划，无需后台任务

#### US-005 skill 交付与使用纪律

作为 Agent，我想要 `nano-mem` skill 告诉我何时写、何时搜、何时 use，并给出 CLI 契约，以便无需人类提醒即可维护记忆。

- [ ] skill 位于 CLI 包内 `skills/nano-mem/SKILL.md`，安装后出现在目标工作区 `.agents/skills/nano-mem/`
- [ ] skill 内容含：何时 `add`（完成决策/用户偏好/踩坑/事实结论）、何时 `search`（任务开始前/相似任务）、何时 `use`（记忆实际用于回答或产物）、记忆三态与遗忘语义、`nm --help` 为事实源的契约段

#### US-006 self skill 管理

作为开发者，我想要 `nm` CLI 能安装/更新/删除自己包内分发的 skill，以便升级 CLI 时同步升级 skill，无需手动拷贝。

- [ ] `nm self skill list|check|install|update|uninstall`（参考 loop-x-cli：`--name`/`--all`/`--target`/`--force`，`--dry-run` 预览，事务化写入带回滚）
- [ ] 默认目标 `<cwd>/.agents/skills`；安装写入 managed marker（`.nano-mem-managed.json`，含 name/version/contentHash）；本地有修改时 update/uninstall 必须 `--force` 才覆盖

#### US-007 CLI 使用文档

作为开发者，我想要 `nm` 的完整使用方式文档，以便上手。

- [ ] 包名 `nano-mem`、CLI 名 `nm`（bin 为 `nm`）；`nm --help` 输出完整命令参考；README 记录命令、环境变量 `NANO_MEM_DB`（默认 `~/.nano-mem/mem.db`）、`--json` 契约与退出码（0 成功/1 运行时错误/2 用法错误）

## 迷雾

无（原 F1-F3 于故事集闭合时确认）：

- 非范围（已接受）：v1 排除 LLM 事实抽取、向量/语义检索、history 事件流、后台调度任务、`nm edit`（修改以删后重建表达）、独立 `nm purge`（清理由 `nm gc` 承担）。
- Node 下限（已接受）：`engines >= 24.0.0`（node:sqlite FTS5 实测于 v24.19 通过；如需兼容 22/23 改依赖 `better-sqlite3`）。
- 默认 agent 名（已接受）：取当前目录名（如 `kxh-kit`），不做 git remote 解析；`--agent` 显式覆盖。

## 上下文

- `.temp/mem0/` — agent 记忆参考实现（架构研究已完成：ADD-only 流水线、md5 去重、scope 分区、BM25+语义融合、软过期）
- `.temp/ts-fsrs/` — FSRS 参考（S/D/R 模型、21 参数、`next/repeat/get_retrievability/forget` API、建议映射）
- `packages/loopx/src/builtins/self/` 与 `packages/loopx/skills/` — `loopx self skill` 管理的参考实现（skill-store 事务/回滚/managed marker、包内 `skills/<name>/` 布局）
- `.agents/skills/loop-x-cli/SKILL.md`、`references/self.md` — skill 契约段与 self 路由的写法参考
- `.flow/quest/2026-09-01-nano-mem记忆框架.md` — 领域打磨审阅（术语/ADR 判定，用户已评价）
- `docs/nano-mem/adr/0001-0003` — 域 ADR（存储检索选型、遗忘状态机、skill 同版发布）
- 实测记录：Node v24.19 `node:sqlite` FTS5 + bm25 OK；FTS5 trigram 不支持 ≤2 字中文查询（已排除），CJK 字符切分方案可行
