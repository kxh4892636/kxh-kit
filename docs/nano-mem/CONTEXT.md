# nano-mem

nano-mem 是 agent 记忆框架业务域：`nano-mem` skill + `nm` CLI，用 SQLite + FTS5 存储检索（无向量），以 FSRS 驱动的「使用 → 增强 → 优先级 → 遗忘」闭环维持记忆库精炼。skill 随 CLI 包分发，经 `nm self skill` 安装到工作区。

## Language

### 记忆

**记忆 (memory)**：
一条可供 agent 复用的文本记录，含分区、记忆标签、元数据与 FSRS 调度字段（stability/difficulty/due/reps/lapses/state/last_review）。
_避免使用_：备忘、笔记、回忆

**记忆库 (store)**：
用户级全局 SQLite 数据库（默认 `~/.nano-mem/mem.db`，`NANO_MEM_DB` 可覆盖），含 FTS5 全文索引；同一分区内文本确定性去重。
_避免使用_：数据库、档案、存储

**记忆标签**：
记忆的可选分类标记（`--tag`），用于检索过滤。
_避免使用_：标贴、分类

### 分区

**agent 分区**：
记忆必属的分区，默认取当前工作目录名（工作区根时为仓库名），如 `kxh-kit`；检索默认限定当前分区。
_避免使用_：命名空间、scope、空间

**run 分区**：
可选的任务/会话子分区（如 DSH sessionId），与 agent 分区共同限定记忆归属。
_避免使用_：会话分区、任务分区、run（单独使用时）

### 使用与检索

**使用**：
记忆被检索或实际采用的记账事件。弱使用 = `nm search` 命中自动记 Hard 评级；强使用 = `nm use` 显式评级（使用评级：easy/good/hard/again）。动作统一措辞为「记使用」。
_避免使用_：命中、曝光、阅读、打卡、强记账

**使用评级**：
对记忆使用的四级评价（again/hard/good/easy），与 FSRS 1-4 评级同源，区别于 LoopX 的 Anki 复习「评分」。
_避免使用_：评分、评级、grade

**检索**：
FTS5 相关性（bm25 经 sigmoid 归一）与 FSRS 即时可检索性 R 的加权排序查询（默认 0.65/0.35）。
_避免使用_：搜索、查询（作为术语）、语义检索

### 遗忘

**遗忘**：
记忆按状态机衰减并由 `nm gc` 清理的过程；状态判定在查询与清理时惰性计算，无后台任务。
_避免使用_：忘记、过期、清理（作为状态）

**活跃 (active)**：
记忆默认可被检索到的遗忘状态。
_避免使用_：正常、启用

**休眠 (dormant)**：
可检索性 R 低于 0.35 的遗忘状态，默认隐藏，`--include-dormant` 可见。
_避免使用_：回收站、待清理、睡眠

**已删 (trashed)**：
`nm delete` 后的遗忘终态，`nm gc` 清除超期（默认 30 天）已删记忆。
_避免使用_：回收站、垃圾箱、删除（作为状态名）

### 共享概念

**受管 skill**、**skill 安装状态**、**预演** 为 common 共享术语（见 [common](../common/CONTEXT.md)），nano-mem 沿用其语义；`--dry-run` 为全局选项。
