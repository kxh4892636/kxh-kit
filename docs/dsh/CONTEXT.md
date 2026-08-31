# DSH

工作区自研 DeepSeek Harness 扩展插件的业务域：以独立插件包扩展 DSH 的技能发现与运行时能力（含会话与模型管理），插件经 `dsh plugin` 安装到本机 profile，与上游仓库解耦。

## Language

### 技能发现

**嵌套 skill**:
位于 `.agents` 树中、处于内建一层形态之外的 `SKILL.md` 技能；由本域插件任意深度发现。
_Avoid_: 子 skill、深层 skill、二级 skill

**内建一层形态**:
`.agents/skills/<skill>/SKILL.md`（及根下平铺 `.md`），DSH 内建 provider 唯一发现的技能位置。
_Avoid_: 顶层 skill、直接子级 skill

**注册名**:
嵌套 skill 在 DSH 目录中的名称，取自 skill frontmatter 的 `name` 原样。
_Avoid_: 命名空间名、前缀名

**声明优先**:
同名师冲突时内建一层形态胜过嵌套 skill 的取胜规则；显式声明者胜。
_Avoid_: 嵌套优先、注册顺序优先

### 插件交付

**DSH 插件**:
以工作区独立包开发、经 `dsh plugin --profile <name> add` 安装的 DSH 扩展；本域产物。
_Avoid_: 上游补丁、改动 DSH 仓库

**发现根**:
参与嵌套 skill 扫描的 `.agents` 根：项目 `<gitRoot>/.agents` 与用户 `$DSH_AGENTS_HOME`（缺省 `~/.agents`）。
_Avoid_: skills 根、扫描目录

### 会话与模型管理

**预置指令**:
会话创建时注入（或部署默认携带）的系统消息/上下文；注入作为系统消息生效，不触发模型调用，首次模型调用等待第一条用户消息。
_Avoid_: agentPreset、agent preset、预设指令、seed、预置消息、用户消息 seed

**会话上下文注入**:
`session_spawn` 的 `context` 参数——以其系统消息形式加入新会话的上下文，与用户消息（触发调用）严格区分。
_Avoid_: 种子消息、初始化用户消息

**会话归档**:
将会话从 workspace 分组表面隐藏的可见性操作；会话日志与数据完整保留，API 无取消归档。
_Avoid_: 删除会话、移除会话、清理会话

**内容搜索索引**:
`session-query-sqlite` 维护的会话全文索引，`openAt` 配置决定启用时机（`startup`/`first-search`/`never`）；启用后 Web 内容搜索框与上游搜索工具均可使用。
_Avoid_: FTS 索引、sqlite 索引、搜索数据库

**模型工具**:
注册到 `ctx.tools`、模型可直接调用的主机能力工具；本插件会话与模型管理能力以此面交付。
_Avoid_: 模型 API、斜杠命令
