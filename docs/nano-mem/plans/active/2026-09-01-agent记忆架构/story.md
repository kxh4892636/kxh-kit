# Agent 记忆架构

## 原始想法

> `$to-story` 阅读 `.temp/mem0` 了解 agent 记忆的原理的架构，仿照 mem0 实现我的以下诉求：
>
> 1. 实现 skill + cli 驱动的一级框架，cli api 设计简单直接
> 2. 记忆信息的存储+检索，使用 sqlite + 全文搜索，不需要向量模型 + 向量搜索
> 3. 参考 `.temp/ts-fsrs` 的 FSRS 机制，每段记忆使用频率越高，越不容易忘记，被检索的频率和优先级更高；长时间不用的记忆会被遗忘
>
> skill 命名为 `nano-mem`，cli 命名为 `nnm`

## 角色

- **Agent**：通过 `nano-mem` skill 在工作前检索记忆、在实际采用后强化记忆，并在形成可复用知识后维护记忆。
- **人类用户**：可直接通过 `nnm` 检查、维护、恢复或删除自己的记忆库。

## 故事

### S1 - 检索相关记忆

作为 agent，我希望在执行任务前通过 `nano-mem` 检索当前项目或全局范围内的相关记忆，以便复用过去形成的知识。

**验收标准**

- 不指定 scope 时，检索当前 project 与 global 记忆，不返回其他 project 的记忆。
- project key 默认为 Git 根目录的目录名；不在 Git 仓库时使用当前目录名；可用 `--project` 显式覆盖。
- FTS 先形成词法相关候选，生命周期与热度只能在相关候选内部调整次序。
- 默认结果不包含已经软遗忘的记忆。

### S2 - 强化实际采用的记忆

作为 agent，我希望只在实际采用一段记忆后强化它，以便真正有用且高频使用的记忆更难遗忘，而单纯被搜索返回不会无限自我强化。

**验收标准**

- `search` 返回一段记忆时只累计检索次数，并只产生有上限的排序加成。
- `use` 表示一次成功采用，更新 FSRS 状态、最后使用时间与使用次数。
- 相同时间跨度内，使用更频繁的记忆比使用更少的同类记忆更晚进入遗忘状态。
- CLI 不暴露 FSRS 四级评分或参数权重。

### S3 - 记录原子记忆

作为 agent，我希望由 skill 将当前上下文提炼成原子记忆，并把确定的内容交给 `nnm` 存储，以便 CLI 保持离线、简单和确定。

**验收标准**

- skill 负责从当前上下文提炼原子内容；CLI 不调用 LLM、embedding 或外部服务。
- `add` 接收位置参数或 stdin 中的文本，公开字段只有必填 `content`、可选 `source` 与 `scope`。
- 新增默认写入当前 project，可显式写入 global。
- 数据存入操作系统用户数据目录下的 SQLite 数据库，并可通过 `NANO_MEM_HOME` 覆盖位置。

### S4 - 解决重复与冲突

作为 agent，我希望在新增前检索可能重复或冲突的记忆，再明确新增、更新或删除，以便记忆库不会依赖 CLI 猜测语义关系。

**验收标准**

- 同一 scope 内规范化文本完全相同的 `add` 幂等返回已有记录，不创建重复项。
- 语义重复或冲突由 skill 检索判断，再显式选择新增、更新或删除。
- 更新内容保留记录 ID 与创建时间，但重置稳定性、使用次数、检索次数和相关生命周期时间。

### S5 - 自然遗忘

作为人类用户，我希望长期不用的记忆逐渐降低优先级并最终从默认检索中隐藏，以便记忆库保持相关，同时仍能恢复被软遗忘的内容。

**验收标准**

- 系统根据版本化的固定 FSRS 参数和连续经过时间计算可检索性。
- 长期未使用的记忆随时间降权，低于策略阈值后进入软遗忘状态并从默认检索中隐藏。
- 遗忘在搜索或列举时惰性计算，不需要后台进程或定时任务。
- `restore` 保留记录 ID 与创建时间，并按新记忆的初始稳定性重新开始，不伪造一次实际使用。

### S6 - 手动维护记忆

作为人类用户，我希望使用简单直接的 `nnm` 命令查看、编辑、恢复和显式删除记忆，以便始终掌控本地数据。

**验收标准**

- v1 命令面为 `add`、`search`、`use`、`get`、`list`、`update`、`forget`、`restore`、`delete`。
- `nnm self skill status|install|update|uninstall` 管理随 CLI 分发的单个 `nano-mem` skill；默认目标为当前工作区 `.agents/skills`，可由 `--target` 覆盖。
- skill 安装状态为 `not_installed | current | outdated | modified`；本地修改必须显式使用 `--force` 才能覆盖或卸载。
- `nnm self update` 默认更新到最新稳定版，也可指定版本或 tag；支持预演，并以失败回滚的事务同步 CLI 与已安装 skill。
- stdout 默认输出稳定 JSON，可通过 `--pretty` 便于人工阅读；诊断写入 stderr，失败返回非零退出码。
- `forget` 可恢复；`delete` 永久删除且必须显式传入 `--force`。
- v1 不提供 pin、历史回滚、导入导出、批处理或后台维护。

### S7 - 检索中文与代码知识

作为 agent，我希望全文搜索能够检索中文自然语言、英文、文件路径和常见代码标识符，以便真实开发记忆不会因文本形态不同而漏检。

**验收标准**

- 中文自然短语能够命中包含该短语的相关记忆。
- 英文关键词、文件路径、`camelCase` 与 `snake_case` 标识符能够命中相关记忆。
- 搜索不依赖向量模型、embedding 或向量数据库。

## 故事状态

`closed` — 用户已确认七个故事、验收标准与 v1 边界。

## 已确认决策

- `nano-mem` skill 负责策略、原子记忆提炼与调用时机；`nnm` 只执行确定性的存储、检索和生命周期操作，不调用 LLM。
- 使用一个用户级 SQLite 数据库；默认按当前 project 隔离，并允许显式使用 global 作用域。v1 不引入 user、agent、session、run 等身份维度。
- 搜索返回累计检索热度，但不改变 FSRS 稳定性；实际采用由 skill 显式记录，只有实际采用会增强抗遗忘能力。
- 检索热度只提供有上限的排序加成，避免热门结果形成无界反馈循环。
- 遗忘采用软遗忘：先随时间降低优先级，低于策略阈值后从默认检索隐藏；物理删除只能显式执行。
- 遗忘检查由搜索或维护操作惰性触发，不运行后台服务。
- v1 只实现 skill 主动调用 CLI，不接入 session hooks、后台进程或全量对话自动捕获。
- 中文自然语言与代码标识符检索属于 v1 硬验收。
- v1 CLI 命令面为 `add`、`search`、`use`、`get`、`list`、`update`、`forget`、`restore`、`delete`；不增加单独的 sweep 命令。
- `nnm` 分发并管理 `nano-mem` 受管 skill，提供 `self skill status|install|update|uninstall` 与事务式 `self update`；CLI 与已安装 skill 保持版本一致。
- stdout 默认使用稳定 JSON，stderr 承载诊断，失败使用非零退出码；文本支持位置参数与 stdin，人工阅读使用 `--pretty`。
- project key 使用 Git 根目录的目录名，不在 Git 仓库时使用当前目录名，并允许 `--project` 覆盖；数据库位于操作系统用户数据目录，可由 `NANO_MEM_HOME` 覆盖。
- 不同路径下的同名根目录默认共享 project 记忆空间；需要隔离时显式使用 `--project` 覆盖。
- 公开记忆字段为必填 `content`、可选 `source` 与 `scope`，不开放任意 JSON metadata 或标签系统。
- 同 scope 的规范化精确重复写入幂等返回已有记录；语义重复与冲突由 skill 处理。
- FTS 是候选硬门槛；FSRS 可检索性、使用次数与有上限的检索热度只在候选内部参与排序。
- `use` 统一表示成功采用；FSRS 参数固定且版本化，不向 CLI 暴露评分等级与权重。
- 内容更新重置全部生命周期统计；恢复按初始稳定性重新开始，同时保留 ID 和创建时间。
- v1 不提供 pin、历史回滚、导入导出、批处理或后台维护。

## 迷雾

- 无。用户可见的角色、作用域、主链路、CLI 契约、遗忘语义、搜索边界与 v1 排除项均已确认。

## 领域检查

- `nano-mem` 已确认为独立业务域，并登记到根 `CONTEXT-MAP.md`。
- Nano Mem 使用 Common 的受管 skill 与 skill 安装状态，关系为 `Nano Mem → Common`；它与 Nano Flow 没有业务依赖。
- 领域 glossary 位于 `docs/nano-mem/CONTEXT.md`；四项长期决策分别由 Nano Mem ADR 0001–0004 持有。

## 上下文

- `.temp/mem0/mem0/memory/main.py`、`storage.py`：Mem0 的直接 CRUD/search surface、ADD-only 写入、scope 隔离、显式更新删除与 history。
- `.temp/mem0/mem0/utils/scoring.py`：语义/BM25/rerank 流水线；nano-mem 只采用 FTS 候选和有界二次排序。
- `.temp/mem0/skills/`、`.temp/mem0/integrations/mem0-plugin/skills/`：skill 驱动的 remember/recall/review 生命周期参考。
- `.temp/ts-fsrs/packages/fsrs/src/models.ts`、`algorithm.ts`、`fsrs.ts`：FSRS 的稳定性、难度、遗忘曲线与可检索性；完整闪卡调度状态机不作为 nano-mem 边界。
- 本机 Node `v24.19.0` 已用内存数据库验证 `node:sqlite` 支持 FTS5 与 `bm25()`。
