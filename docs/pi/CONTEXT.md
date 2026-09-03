# Pi

Pi 扩展业务域以可安装 package 扩展 Pi coding agent。本域拥有 package 中的 extension、模型工具、skill 能力及其用户级配置，不拥有 Pi 上游运行时。

## Language

### 插件交付与配置

**Pi package**:
通过 `package.json` 的 `pi` manifest 声明 extension 等资源、可由 Pi 以 local、npm 或 git 来源安装的交付单元。
_Avoid_: Pi 插件包、单文件扩展

**Pi extension**:
由 Pi 加载的 TypeScript factory；它通过 `ExtensionAPI` 注册模型工具和其他运行时扩展点。
_Avoid_: 插件进程、provider

**全局插件配置**:
位于 Pi `getAgentDir()` 下、由一个 Pi package 跨项目共享的用户级配置；`pi-deepseek-web` 使用 `pi-deepseek-web.json`。
_Avoid_: 项目配置、package-local 配置

### 搜索与抓取

**原生网页搜索**:
通过 DeepSeek Anthropic-compatible Messages API 的 server-side `web_search` 工具产生结构化来源的搜索操作；每个查询消耗一次独立模型调用。
_Avoid_: URL 抓取、搜索摘要

**结构化搜索来源**:
来自 `web_search_tool_result` 的 URL、标题与日期，以及按 URL 关联的 citation snippet；provider prose 不属于来源。
_Avoid_: 模型回答、prose fallback

**公共网页抓取**:
不携带凭据地读取公共 HTTP(S) 文本资源，并把连接固定到已验证的公共地址；它不是浏览器执行环境。
_Avoid_: 浏览器访问、内网抓取、DeepSeek 抓取

### 技能发现与调用

**原生 skill**:
Pi 在插件补充发现前已经载入目录的 skill；同名冲突时优先于嵌套 skill。
_Avoid_: 顶层 skill、普通 skill

**嵌套 skill**:
位于另一个原生 skill 根目录之下、因父目录已有 `SKILL.md` 而不会被 Pi 继续发现的后代 `SKILL.md` skill。
_Avoid_: 子 skill、深层 skill、二级 skill

**补充路径**:
插件从原生 skill 根下发现并通过 `resources_discover` 交回 Pi 的嵌套 `SKILL.md` 路径；其解析、校验和目录注册仍由 Pi 负责。
_Avoid_: 扫描根、插件目录

**skill marker**:
用户输入中精确命名已载入 skill 的 `/skill:<name>` 标记；可以在任意位置出现任意次数。
_Avoid_: skill 命令、slash command

**原位展开**:
按出现顺序将每个未转义 skill marker 替换为 Pi 原生 skill block，并保持其余用户文本原序不变的输入变换。
_Avoid_: 前置注入、递归展开、逐 skill 参数

**声明优先**:
同名冲突时原生 skill 胜过补充发现的嵌套 skill，显式已载入声明不被后代覆盖。
_Avoid_: 嵌套优先、最后注册优先

### Subagent 委派

**Subagent**:
由父 agent 委派、拥有独立会话上下文并向父级返回结果的 agent。
_Avoid_: 子 agent、child agent

**Delegation Depth**:
Subagent 委派链中 agent 相对 main 的深度；main 为 0，每跨一条委派边加 1。
_Avoid_: 委派深度、递归层数、agent 层级

**Fresh Subagent**:
不继承父会话对话历史的 Subagent；它仍可共享 cwd 并重新加载适用的项目 context。
_Avoid_: forked subagent、空白 agent

### 目标与自主轮次驱动 (Goal)

**Goal (目标)**:
跨会话轮次（turns）持续存在的具象完成目标，具备唯一的持久化状态、修订版本（revision）、阶段（active/completed/blocked/paused）与激活态（armed/disarmed）。
_Avoid_: 待办项、Plan、任务

**Goal Phase (目标阶段)**:
Goal 状态机的生命周期阶段，包括 `active`（进行中）、`completed`（已完成）、`blocked`（持久受阻）与 `paused`（用户挂起）。
_Avoid_: 任务状态、Goal 状态

**Goal Round Driver (轮次驱动器)**:
在 Agent turn 结束进入空闲（quiescence）时，若检测到活跃且已装配（armed）的 Goal，自动向会话收件箱注入继续轮次提示（`<goal_round>`）的后台闭环机制。
_Avoid_: 自动循环、外部定时器、递归调用

**Human Authority (人类主导权限)**:
对 Goal 关键变动的独占控制权。目标的重设（`edit`）、暂停（`pause`）与恢复（`resume`）仅限人类（或 slash command）发起，模型无权越权篡改。
_Avoid_: 强制权限、用户特权

**Blocked Barrier (受阻门禁)**:
模型声明目标 `blocked` 前必须满足的防偷懒门禁，要求模型在连续多轮尝试未果且处于相同客观阻碍事实时方可置为 blocked。
_Avoid_: 报错阻断、失败退出
