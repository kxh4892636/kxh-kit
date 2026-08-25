# LoopX

LoopX 将想法路由为可验收的设计、Plan 和交付 Flow，并以单一 TypeScript CLI 收口多种内建命令行能力。它同时管理与 CLI 配套的 agent skill；Anki 能力归属本域，以 `loopx anki` 子命令提供。

## Language

### Flow

**Flow 发起者**：
请求进入一次 Flow 路径的 skill；`/loop-x` 动态选择入口 skill，固定入口 skill 则选择自身。
_避免使用_：当前 skill

**入口 skill**：
经用户确认后开始一条 Flow 路径的 skill，限于 `/grill-with-docs`、`/to-story` 或 `/to-issues`。
_避免使用_：next skill

**Flow 路径**：
与入口 skill 一一对应的有序卡点与交付 receipt 链，分为 `main`、`story` 和 `issues`。
_避免使用_：模式

**Flow 标识**：
`YYYY-MM-DD-{name}` 形态的可读标识，用于区分不依附领域 Plan 的 `/grill-with-docs` 运行；它不是文件系统目录。
_避免使用_：Plan 路径、flow ID

### CLI

**loopx**:
对外提供单一 `loopx` bin 的 npm CLI；各项业务能力位于其命令树中。
_Avoid_: loopx-cli、CLI 集合、命令集合器

**内建子命令**:
随 `loopx` 包一起建立和分发的顶层命令能力，如 `self` 和 `anki`。MVP 不从运行时加载第三方插件。
_Avoid_: 独立 CLI、插件、tool

**真实执行**:
未启用 `--dry-run` 时的默认执行模式，允许命令产生其定义的持久化副作用。
_Avoid_: apply mode、normal mode

**预演**:
由全局 `--dry-run` 选项启用的执行模式；写命令只返回原本将执行的操作，不产生持久化副作用。
_Avoid_: 模拟执行、试跑、只读模式

### Workspace 管理

**工作区配置**:
`workspace.yaml`，工作区根目录下声明子仓集合（name/url/path/branch）的文件；从 cwd 向上查找的第一个即生效，其所在目录即工作区根。
_Avoid_: 仓库清单、manifest

**本机覆盖**:
`workspace.local.yaml`，记录每个子仓克隆存储在本机的实际路径；位于工作区根，不进版本控制。
_Avoid_: 本地配置、机器配置

**克隆存储**:
子仓在本机的浅克隆（`--depth 1` + 基准分支），默认位于 `~/workspaces/<name>`，本机覆盖中已记录的实际路径优先。
_Avoid_: 缓存、镜像

**物化**:
把配置中的子仓变为本机可用状态的完整动作：克隆存储就位并记录本机覆盖，worktree 检出工作分支。
_Avoid_: 同步、初始化

**工作分支**:
worktree 从基准分支创建的本地分支，默认命名 `worktree/<仓库名>-<yyyymmddhhmmss>`，`pull` 物化时可通过 `--worktree-branch` 显式指定；与远程分支命名空间隔离。
_Avoid_: 开发分支

**主 worktree**:
配置 `path` 字段对应的 worktree，由 `pull` 默认物化；子仓的其他已注册 worktree 为额外 worktree，由 `pull --path --worktree-branch` 创建。
_Avoid_: 默认 worktree

### Skill 管理

**受管 skill**:
由 `loopx` 包分发，并由 `loopx self skill` 安装、检测、更新或卸载的完整 skill 树；其版本始终跟随 CLI 版本。
_Avoid_: 插件、独立 skill 包

**skill 安装状态**:
受管 skill 相对当前 CLI 包的状态：`not_installed`、`current`、`outdated` 或 `modified`。
_Avoid_: 同步状态、健康状态

**CLI 路由 skill**:
以 `loop-x-cli` 为名的受管 skill，识别 CLI 任务意图并路由到正确的 `loopx` 内建子命令。
_Avoid_: anki-cli skill、子命令 skill

### Anki 通道

**AnkiConnect**:
Anki 的本地 HTTP 插件（FooSoft 出品，Anki 插件码 2055492159，默认 `http://localhost:8765`）。`loopx anki` 与 Anki 之间的唯一通道。
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
「拉取到期卡片 → 逐张呈现 → 评分」的完整闭环，由 `loopx anki review` 承载。
_Avoid_: 学习会话、study session

### Anki 执行

**Anki 操作**:
`loopx anki` 下按「资源 动词」分组的最小 CLI 行为（如 `notes add`）；其行为和校验继承原 Anki CLI。
_Avoid_: 工具、tool、独立子命令

**只读模式**:
Anki 的全局开关（`--read-only` / `READ_ONLY`），阻止一切写操作，复习与同步除外。
_Avoid_: safe mode、保护模式
