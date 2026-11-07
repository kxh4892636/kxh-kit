# DSH

工作区自研 DeepSeek Harness 扩展的业务域：以独立插件包承载一组可独立开关的工具（技能发现、会话撤回等），与上游仓库解耦。

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
同来源内同名师冲突时内建一层形态胜过嵌套 skill 的取胜规则；显式声明者胜。跨来源仍按上游来源序（project > custom > user > bundled），来源优先级不被「声明」改变。
_Avoid_: 嵌套优先、注册顺序优先

### 工具集

**工具集**:
一个插件包内可独立开关的多项能力；`@kxh4892636/dsh-toolkit` 是唯一实例。
_Avoid_: 插件集合、子插件

**工具开关**:
按工具 id 持久化的启用状态，宿主持有、面板可写；关闭即卸载该工具在宿主与界面的全部效果。
_Avoid_: 配置项、feature flag

### 技能屏蔽

**office 屏蔽**:
把宿主机内置的 office 技能从技能注册表读取面（`list` / `snapshot` / `get`）过滤掉的开关效果；不注销 provider、不改技能文件，关闭即还原。
_Avoid_: 删除 office 技能、卸载 office 插件

### Nano Flow 预设

**nano-flow 预设**:
本插件声明的 Agent 预设；选中它的会话才在预设作用域内挂载固定提示词、`nano_flow_*` 工具与随包 skill。
_Avoid_: 流程开关、manual / auto 模式

**固定提示词**:
`nano-flow/prompt.md` 的正文，作为系统提示词的一段按字面量注入；不含变量，跨会话字节稳定。
_Avoid_: persona、系统提示

**会话域**:
一个 nano-flow 会话只属于一个业务域：新会话先按 CONTEXT-MAP 定位，缺失则用 `init` 新建；`common` 是任何域都可读写的公共域。
_Avoid_: 多域并行、跨域会话

**notes DAG**:
Plan 的实现记录，存在 `notes.json` 里；一条 note 对应一个可独立验收的用户结果，依赖关系构成有向无环图，只能经 `nano_flow_write` 修改。
_Avoid_: 任务列表、todo、issue 树

**生效上限**:
toolkit 面板「Nano Flow 上限」设置区维护的唯一数字来源（story/spec/note/摘要/索引/领域文档字节与轮转阈值）；持久化在 `$DSH_HOME/toolkit/nano-flow.json`，提示词不写数字。
_Avoid_: 魔法数字、硬编码阈值

**会话轮转**:
预设不挂压缩插件；用户每发一条 queue 消息时读上下文压力，达到 `rotateAt × contextWindow` 就创建新会话（种子 + 该消息），新 prompt 被接受后物理删除旧会话（不是归档），失败回落旧会话。
_Avoid_: 压缩、compact、归档旧会话

**恢复只读**:
用户说"恢复""继续"且会话还没加载 Plan 时只读加载：`resume` 拿恢复包，读 story / spec，报告进度与可推进队列，本轮不写文件、不执行 note；恢复报告之后的用户消息才放行执行，轮转出的新会话同样先只读恢复。
_Avoid_: 自动续跑、恢复即执行

**等待验证**:
note 的第五个状态（`awaiting_verification`）：交付物已完成、等待真机或用户验收；仍算未完成，`complete` 必须先经过它，验证失败回 `in_progress`。
_Avoid_: 待验收、验收中、等待确认

### 会话撤回

**撤回**:
把会话回到上一轮结束的状态并取回该轮用户原文的操作；宿主无删除/截断 API，因此以 `session/fork` 切点前缀实现，再归档、接管置顶位并**彻底删除**原会话（日志 + 记账 + 归档占位）。
_Avoid_: 回滚、撤销历史、时间旅行

**切点**:
被撤销那一轮的 `turn/start` 之前最近的**非 inbox 记账**事件 seq，作为 fork 的闭区间边界；排队提示词先写入 `agent/inbox/*`，跳过它才不会被带进子会话。
_Avoid_: 断点、分割点

### 插件交付

**DSH 插件**:
以工作区独立包开发、经 `dsh plugin --profile <name> add` 安装的 DSH 扩展；本域产物。
_Avoid_: 上游补丁、改动 DSH 仓库

**发现根**:
参与嵌套 skill 扫描的 `.agents` 根：项目 `<gitRoot>/.agents` 与用户 `$DSH_AGENTS_HOME`（缺省 `~/.agents`）。
_Avoid_: skills 根、扫描目录
