---
name: 'Nano Flow'
description: 'Nano Flow 业务域：以单一 nnf CLI 提供 AnkiConnect 自动化与受管 skill 分发；文档流程已由 pi / dsh 域的 nano-flow 实现取代。'
relations:
  - to: 'common'
    description: 'Nano Flow 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。'
---

# Nano Flow

本域以单一 TypeScript CLI（`nnf`）提供两项能力：`nnf anki` 经 AnkiConnect 自动化本机 Anki，`nnf self` 分发与校验包内受管 skill。Anki 能力归属本域。

文档流程（story/spec/notes、`manual`/`auto` 模式、逐轮拷问与门禁交付）不再由本域 CLI 承载：那套 `nano-flow` 流程 skill 与 `nnf workspace` 命令已下线，现行流程由 pi 与 dsh 域的 nano-flow 实现提供。

## Language

### Plan 与 note

**Plan**：
承载一次工作的文档集合，由 spec 与 notes 组成，位于 `.agents/domains/{domain}/plans/{active|reference|archived}/`；生命周期表达工作阶段，note 状态表达子任务进度。本域不再定义这套模型，只沿用 pi / dsh 域 nano-flow 的实现。
_Avoid_：flow、工作流实例、issue 图

**note**：
Plan 内推进一个可独立验收的交付单元（讨论、调查、计划或实现）的文档；状态为 `pending`、`in_progress`、`blocked` 或 `completed`。
_Avoid_：task、ticket

### CLI

**nnf**：
对外提供单一 `nnf` bin 的 npm CLI；各项业务能力位于其命令树中。
_Avoid_：nnf-cli、CLI 集合、命令集合器

**内建子命令**：
随 Nano Flow npm 包一起建立和分发的顶层命令能力，如 `self` 和 `anki`。MVP 不从运行时加载第三方插件。
_Avoid_：独立 CLI、插件、tool

### Skill 管理

**受管 skill** 与 **skill 安装状态** 为 common 共享术语（见 [common](../common/CONTEXT.md)），Nano Flow 沿用其语义。

**CLI 路由 skill**：
以 `nano-flow-cli` 为名的受管 skill，识别 CLI 任务意图并路由到正确的 `nnf` 内建子命令；它是包内唯一分发的受管 skill。
_Avoid_：anki-cli skill、子命令 skill

### Anki 通道

**AnkiConnect**：
Anki 的本地 HTTP 插件（FooSoft 出品，Anki 插件码 2055492159，默认 `http://localhost:8765`）。`nnf anki` 与 Anki 之间的唯一通道。
_Avoid_：add-on、插件（在本域内指代该通道时）

**action**：
AnkiConnect 暴露的单次操作单元（如 `deckNames`、`addNote`、`answerCards`）；每个 Anki 操作在内部映射到一个或多个 action。
_Avoid_：接口、API

### Anki 数据模型

**笔记**：
一张笔记 = 一个笔记类型 + 一组字段值 + 标签；按笔记类型的卡片模板可生成多张卡片。
_Avoid_：条目、记录

**卡片**：
由笔记按卡片模板生成的最小复习单元，携带调度状态与复习历史。
_Avoid_：卡（口语化）、笔记

**牌组**：
卡片的归属容器，使用 `::` 分隔非空层级，支持任意深度的牌组树。
_Avoid_：分类、分组

**笔记类型**：
定义字段列表、卡片模板与 CSS 的模板类型（Anki 的 note type）。
_Avoid_：model、模板（与卡片模板冲突）、type

**卡片模板**：
笔记类型内定义卡片正反面 HTML 的模板（Anki 的 card template）。
_Avoid_：模板（与笔记类型冲突）

**字段**：
笔记类型声明的命名槽位，笔记为其填充值；第一个字段是排序字段，不可为空。
_Avoid_：属性、列

### Anki 复习

**到期**：
卡片已到达应复习时间的调度状态。
_Avoid_：过期、待复习

**评分**：
复习时对记忆表现的 4 级评价：Again(1)/Hard(2)/Good(3)/Easy(4)，提交后更新卡片调度。
_Avoid_：评级、打分、grade

**复习会话**：
「拉取到期卡片 → 逐张呈现 → 评分」的完整闭环，由 `nnf anki review` 承载。
_Avoid_：学习会话、study session

### Anki 执行

**Anki 操作**：
`nnf anki` 下按「资源 动词」分组的最小 CLI 行为（如 `notes add`）；其行为和校验继承原 Anki CLI。
_Avoid_：工具、tool、独立子命令

**只读模式**：
Anki 的全局开关（`--read-only` / `READ_ONLY`），阻止一切写操作，复习与同步除外。
_Avoid_：safe mode、保护模式
