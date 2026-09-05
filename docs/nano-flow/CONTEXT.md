# Nano Flow

Nano Flow 将想法路由为可验收的设计、Plan 和交付 Flow，并以单一 TypeScript CLI 收口多种内建命令行能力。它同时管理与 CLI 配套的 agent skill；Anki 能力归属本域，以 `nnf anki` 子命令提供。

## Language

### Flow

**Flow 发起者**：
请求进入一次 Flow 路径的 skill；由 `/nano-flow` 选择并进入已确认的起点。
_避免使用_：当前 skill

**入口 skill**：
经用户确认后开始一条 Flow 路径的 skill；当前为 `/questing`。
_避免使用_：next skill

**Flow 路径**：
从入口开始的有序步骤与交付 receipt 链；拷问和 issue 拆分之后，按拆分结果进入直接交付或 issue 交付。
_避免使用_：模式

**Flow 标识**：
工作区内稳定且唯一的 Plan 标识；需要持久化 issue 图时，使用实际 Plan 路径。
_避免使用_：Plan 路径、flow ID

### CLI

**nnf**:
对外提供单一 `nnf` bin 的 npm CLI；各项业务能力位于其命令树中。
_Avoid_: nnf-cli、CLI 集合、命令集合器

**内建子命令**:
随 Nano Flow npm 包一起建立和分发的顶层命令能力，如 `self` 和 `anki`。MVP 不从运行时加载第三方插件。
_Avoid_: 独立 CLI、插件、tool

### Workspace 管理

**工作区配置**:
`workspace.yaml`，工作区根目录下声明子仓集合（name/url/path/branch）的文件；`path` 是子仓克隆相对工作区根的路径。从 cwd 向上查找的第一个即生效，其所在目录即工作区根。
_Avoid_: 仓库清单、manifest

**子仓克隆**:
工作区配置所声明的远程子仓在 `path` 上的普通浅克隆（`--depth 1` + 基准分支）；额外 worktree 均以它为生成基础。
_Avoid_: 缓存、镜像

**物化**:
把工作区配置中的远程子仓克隆到其 `path`，使子仓克隆在工作区中可用。额外 worktree 不是物化的默认产物。
_Avoid_: 同步、初始化

**工作分支**:
worktree 从基准分支创建的本地分支，默认命名 `worktree/<仓库名>-<yyyymmddhhmmss>`；与远程分支命名空间隔离。
_Avoid_: 开发分支

### Skill 管理

**受管 skill** 与 **skill 安装状态** 为 common 共享术语（见 [common](../common/CONTEXT.md)），Nano Flow 沿用其语义。

**CLI 路由 skill**:
以 `nano-flow-cli` 为名的受管 skill，识别 CLI 任务意图并路由到正确的 `nnf` 内建子命令。
_Avoid_: anki-cli skill、子命令 skill

### Anki 通道

**AnkiConnect**:
Anki 的本地 HTTP 插件（FooSoft 出品，Anki 插件码 2055492159，默认 `http://localhost:8765`）。`nnf anki` 与 Anki 之间的唯一通道。
_Avoid_: add-on、插件（在本域内指代该通道时）

**action**:
AnkiConnect 暴露的单次操作单元（如 `deckNames`、`addNote`、`answerCards`）；每个 Anki 操作在内部映射到一个或多个 action。
_Avoid_: 接口、API

### Anki 数据模型

**笔记**:
一张笔记 = 一个笔记类型 + 一组字段值 + 标签；按笔记类型的卡片模板可生成多张卡片。
_Avoid_: 条目、记录

**卡片**:
由笔记按卡片模板生成的最小复习单元，携带调度状态与复习历史。
_Avoid_: 卡（口语化）、笔记

**牌组**:
卡片的归属容器，使用 `::` 分隔非空层级，支持任意深度的牌组树。
_Avoid_: 分类、分组

**笔记类型**:
定义字段列表、卡片模板与 CSS 的模板类型（Anki 的 note type）。
_Avoid_: model、模板（与卡片模板冲突）、type

**卡片模板**:
笔记类型内定义卡片正反面 HTML 的模板（Anki 的 card template）。
_Avoid_: 模板（与笔记类型冲突）

**字段**:
笔记类型声明的命名槽位，笔记为其填充值；第一个字段是排序字段，不可为空。
_Avoid_: 属性、列

### Anki 复习

**到期**:
卡片已到达应复习时间的调度状态。
_Avoid_: 过期、待复习

**评分**:
复习时对记忆表现的 4 级评价：Again(1)/Hard(2)/Good(3)/Easy(4)，提交后更新卡片调度。
_Avoid_: 评级、打分、grade

**复习会话**:
「拉取到期卡片 → 逐张呈现 → 评分」的完整闭环，由 `nnf anki review` 承载。
_Avoid_: 学习会话、study session

### Anki 执行

**Anki 操作**:
`nnf anki` 下按「资源 动词」分组的最小 CLI 行为（如 `notes add`）；其行为和校验继承原 Anki CLI。
_Avoid_: 工具、tool、独立子命令

**只读模式**:
Anki 的全局开关（`--read-only` / `READ_ONLY`），阻止一切写操作，复习与同步除外。
_Avoid_: safe mode、保护模式
