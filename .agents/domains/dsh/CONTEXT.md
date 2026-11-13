---
name: 'DSH'
description: '工作区自研 DeepSeek Harness 扩展的业务域：独立插件包、可开关工具与 Nano Flow 预设。'
relations:
  - to: 'nano-flow'
    description: 'DSH 工具集的嵌套 skill 工具使 Nano Flow 以嵌套 skill 形式分发的主流程 skill 能被发现与调用。'
metadata:
  owner: 'dsh'
---

# DSH

工作区自研 DeepSeek Harness 扩展的业务域：以独立插件包承载一组可独立开关的工具（嵌套 skill 发现、会话撤回、office 技能屏蔽等），并提供 Nano Flow Agent 预设，与上游仓库解耦。

## Language

### 嵌套 skill 发现

**嵌套 skill**：
位于 `.agents` 树中、处于内建一层形态之外的 `SKILL.md` 技能；由本域插件任意深度发现。
_Avoid_：子 skill、深层 skill、二级 skill

**内建一层形态**：
`.agents/skills/<skill>/SKILL.md`（及根下平铺 `.md`），DSH 内建 provider 唯一发现的技能位置。
_Avoid_：顶层 skill、直接子级 skill

**注册名**：
嵌套 skill 在 DSH 目录中的名称，取自 skill frontmatter 的 `name` 原样。
_Avoid_：命名空间名、前缀名

**声明优先**：
同来源内同名师冲突时内建一层形态胜过嵌套 skill 的取胜规则；显式声明者胜。跨来源仍按上游来源序（project > custom > user > bundled）。
_Avoid_：嵌套优先、注册顺序优先

### 工具集

**工具集**：
一个插件包内可独立开关的多项能力；`@kxh4892636/dsh-toolkit` 是唯一实例。
_Avoid_：插件集合、子插件

**工具开关**：
按工具 id 持久化的启用状态，宿主持有、面板可写；关闭即卸载该工具在宿主与界面的全部效果。
_Avoid_：配置项、feature flag

**office 屏蔽**：
把宿主机内置的 office 技能从技能注册表读取面（`list` / `snapshot` / `get`）过滤掉的开关效果；不注销 provider、不改技能文件，关闭即还原。
_Avoid_：删除 office 技能、卸载 office 插件

### Nano Flow 预设

**nano-flow 预设**：
本插件声明的 Agent 预设；选中它的会话才在预设作用域内挂载固定提示词、`GUIDE.md` 快照、篇幅限制块、`nano_flow_create` / `nano_flow_check` 工具与随包 skill。
_Avoid_：流程开关、nano-flow 命令行

**固定提示词**：
`prompts/system.md` 的正文，与 `.agents/domains/GUIDE.md` 的会话启动快照、`prompts/limit.md` 生成的篇幅限制块一起作为系统提示词段注入。
_Avoid_：persona、系统提示

> 纠正（2026-11-08，note 006）：本节原写 `prompts/agents.md`；该文件已改名为 `prompts/system.md`，注入段名 `nano-flow:system`（原名会被当作 `AGENTS.md` 自动注入）。

**领域文档**：
`.agents/domains/{domain}/` 下的 CONTEXT、questions、adr、workflows 与 plans；文档以 YAML 头声明 `name` / `description`，索引由 `nano_flow_check` 生成，模型不改生成物。
_Avoid_：wiki、知识库、notes.json

**Plan**：
一个会话默认维护的工作单元，包含 `spec.md`、`notes_index.md`（生成）与若干 `NNN-中文标题.md` 的 note；note 用 `pending` / `in_progress` / `blocked` / `completed` 表达进度，`blocked` 时以 `reason` 说明在等什么。交付完成但未验收一律 `blocked`，只有用户验收后才置 `completed`。
_Avoid_：story、DAG、任务列表

**交付单元**：
note 的划分单位：一个可独立验收的交付物；同一单元内的返工、补测、修正与验证并入原 note，只有验收条件或状态需要分别表达（会单独 `blocked`、单独验收）时才拆（[ADR 010](adr/010-note按交付单元划分.md)）。
_Avoid_：原子子任务、按主题聚合

**批量写**：
Plan 与领域文档的写入节奏：每轮最多两次（轮首记本轮目标与方向，轮末补进度、状态、证据与 spec），每次批量写完之后跑一次 `nano_flow_check`，同一批次不重复跑；面板与索引在一轮之内允许滞后。
_Avoid_：状态先行、实时逐条写

**会话↔Plan 绑定**：
`$DSH_HOME/toolkit/nano-flow-plan-bindings.json` 中按会话 id 记录的唯一 Plan（`planPath` / `cwd` / `boundAt`）；同一会话只保留一个绑定，只有 `nano_flow_bind` 写它，再次调用即切换。供 Note 看板与 `log.jsonl` 使用，不参与 note 状态判定。

绑定的 Plan 目录由 `resolvePlanDirectory` 统一解析：绝对 `planPath` 直通；相对路径先试绑定时的 `cwd`，该目录不在就退回当前工作区。Plan 迁走后目录解析不到，看板返回空、`log.jsonl` 跳过写入（不重建旧路径），不会产生孤儿日志；`nano_flow_bind` 收尾会回收宿主已不存在的会话条目，存活性以「持久化列表 ∪ 仍存活的会话」判断，拿不到列表时不动表。
_Avoid_：当前 Plan、任务上下文

**生效上限**：
toolkit 面板「Nano Flow 设置」维护的数值来源，持久化在 `$DSH_HOME/toolkit/nano-flow.json`；启动时由它生成「篇幅限制」块，不把具体数字写死在提示词里。
_Avoid_：魔法数字、硬编码阈值

**会话轮转**：
预设不挂压缩插件；用户每发一条 queue 消息时读上下文压力，达到 `rotateAt × contextWindow` 就创建新会话（同一 cwd 与预设），新 prompt 被接受后先归档、再物理删除旧会话（归档会让客户端立刻离开旧会话，切视图因此挂在客户端根上下文），失败回落旧会话。新会话不继承旧会话的对话历史（历史只由 `<plan>/log.jsonl` 留存），拿到的只有：以用户消息投递的 seed（「已轮转」+ 当前 Plan 线索 + 只读恢复要求 + 轮转后自动校验结论与「轮转前会话绑定的 Plan」只读线索 +「新会话不会自动绑定」+ 最末的上一轮模型输出 `<rotation-last-output>` 块）、包在 `<rotation-prior-input>` 里并紧跟其后的本次触发原文，以及过继来的工作区槽位与置顶。绑定不继承，新会话首轮先调用 `nano_flow_bind`。轮转只能自动触发；客户端在根上下文订阅导航选择 store，旧会话被归档离开时读轮转路由切到新会话（会话面板的 5s 轮询只作兜底）。
_Avoid_：压缩、compact、归档旧会话

**恢复只读**：
用户说“恢复”“继续”且会话还没加载 Plan 时先调用 `nano_flow_bind` 绑定目标 Plan，再只读加载：读 `spec.md` 与 `notes_index.md`，报告进度与可推进队列；除 bind 的会话绑定外不写文件、不执行 note。恢复报告之后的第一条用户消息才放行。
_Avoid_：自动续跑、恢复即执行

**note 面板**：
nano-flow 预设会话在输入框上方 dock 显示的 note 面板（中文状态名 + 名称，hover 显示描述 + 有值时的「原因」「下一步」三行）；已绑定 Plan 时**常驻**且**默认展开**（点标题行收起/再展开，状态存内存，重挂载回到展开），未完成列表为空时显示「全部完成」空态（无绑定或目录失效才不显示）。客户端按当前 `sessionId` 每 5s 轮询宿主 `GET /api/toolkit/nano-flow/notes`，宿主按该会话的绑定定位 Plan，快照不写会话日志，样式与 Todo 面板一致。
_Avoid_：待办面板、todo 面板、任务列表

**Plan 轨迹日志**：
nano-flow 预设会话每轮结束时向 `<plan>/log.jsonl` 追加的一条 compact 轨迹（user、assistant 最终文本、工具参数/结果摘要、usage、seq 区间）；只有 `nano_flow_bind` 写绑定，未绑定时服务只跟踪事件、不落盘；绑定后写当前轮与后续轮次，绑定前已完成的轮次不回填；切换后后续轮次写新 Plan，旧 Plan 不再追加。启动时从宿主持久化日志回填已绑定且归该 Plan 的历史轮次，绝不写会话事件。日志只存本地（`.gitignore` 忽略 `**/plans/**/log.jsonl`），轮转不删、只增量追加。
_Avoid_：会话转录、原始事件日志、audit log

### 记忆维护（dream）

**记忆分层**：
nano-flow 记忆的四层：L0 `<plan>/log.jsonl` 轨迹、L1 note 的结论、L2 领域文档与「## 相关」互链、L3 `GUIDE.md` 会话快照（`system.md` 由用户维护）；dream 只写 L2/L3 正文，其中 L3 正文只由 dream 父会话整体重写、`nano_flow_create` 仅在缺失时补空模板，生成物只由 `nano_flow_check` 写。
_Avoid_：记忆库、知识图谱、第五层

**dream**：
后台记忆维护回合：宿主定时任务把 `prompts/dream.md` 全文投递到新建的 nano-flow 会话，按游标把 `log.jsonl` 的新轮次做纠错、提炼、建链、晋升、剪枝，落到领域文档与 `GUIDE.md`。
_Avoid_：自动复盘、kaizen、离线批处理

**dream 游标**：
`$DSH_HOME/toolkit/nano-flow-dream.json`（v2）按「Plan + 会话」记录已处理到的 turn seq 上界；只由 `nano_flow_dream` 的 `mark` 动作在 `git commit` 成功后推进（实现是随包 `dream-scan.mjs`），重复投递靠它保持幂等。seq 换会话会重新计数，所以旧 v1 的 Plan 级 `lastSeq` 一律当空游标全量处理。
_Avoid_：进度条、checkpoint

### 会话撤回

**撤回**：
把会话回到上一轮结束的状态并取回该轮用户原文的操作；宿主无删除/截断 API，因此以 `session/fork` 切点前缀实现，再归档、接管置顶位并彻底删除原会话（日志 + 记账 + 归档占位）。
_Avoid_：回滚、撤销历史、时间旅行

**切点**：
被撤销那一轮的 `turn/start` 之前最近的**非 inbox 记账**事件 seq，作为 fork 的闭区间边界；排队提示词先写入 `agent/inbox/*`，跳过它才不会被带进子会话。
_Avoid_：断点、分割点

### 插件交付

**DSH 插件**：
以工作区独立包开发、经 `dsh plugin --profile <name> add` 安装的 DSH 扩展；本域产物。
_Avoid_：上游补丁、改动 DSH 仓库

**发现根**：
参与嵌套 skill 扫描的 `.agents` 根：项目 `<gitRoot>/.agents` 与用户 `$DSH_AGENTS_HOME`（缺省 `~/.agents`）。
_Avoid_：skills 根、扫描目录
