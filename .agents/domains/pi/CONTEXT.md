# Pi

pi 扩展业务域：以单个 pi package（`@kxh4892636/pi-toolkit`）扩展宿主能力——按开关提供嵌套 skill 发现、`$` 引用插入与展开、经 DeepSeek 官方 Search/Fetch API 的 web 搜索与抓取、会话自动命名，以及从 DSH 迁入并与多 Plan 编排合并成单一能力的 `orchestrator`（Plan/notes DAG 交付流程 + 派工、放行与按 Plan 恢复）。与 pi 本体解耦，经 `pi install` 安装。

## Language

### 插件形态

**pi 插件**：
以工作区独立包开发、经 `pi install` 安装、通过 `package.json` 的 `pi` 清单提供 extension/skill 资源的 pi 扩展；本域产物。
_避免使用_：上游补丁、改动 pi 仓库、DSH 插件

**扩展接缝**：
pi 对外公开、扩展可挂载的事件与方法面（如 `resources_discover`、`input`、`ctx.ui.addAutocompleteProvider`、`pi.registerTool`）。
_避免使用_：hook、provider、注册表

**工具包（toolkit）**：
本域唯一的 pi 插件 `@kxh4892636/pi-toolkit`：把 web 工具、嵌套 skill、`$` 引用、会话命名与 `orchestrator` 收在一个包里，由 `/toolkit` 开关统一启停。
_避免使用_：插件集合、多个 pi 包

### 开关与配置

**开关**：
`/toolkit` 面板中的一行 on/off，对应 `pi-toolkit.json` 的 `tools.<key>`；面板现在四行，一个开关对应一个能力：`webTools`、`nestedSkills`、`sessionName`、`orchestrator`，默认全部关闭。
_避免使用_：feature flag、环境变量开关

**默认关闭**：
未写配置或配置缺省时，所有开关均为 `false`；插件加载不激活工具、不发现嵌套 skill、不展开 `$`、不自动命名、不启用 `orchestrator`，直到用户在 `/toolkit` 中显式打开。
_避免使用_：默认全开、安装即可用

**开关面板**：
`/toolkit` 打开的 TUI 屏幕：复用 pi `/settings` 的组件与交互（带边框的 `SettingsList`、可搜索、Enter/Space 切换、Esc 关闭），面板只改开关，其它参数留在 JSON。
_避免使用_：配置向导、子菜单

**插件配置**：
`~/.pi/agent/pi-toolkit.json`（项目 `.pi/` 可覆盖，`PI_TOOLKIT_CONFIG` 指定路径最高优先）承载全部开关与可配置项的唯一 JSON 文件；按节深合并，`/toolkit` 写回优先级最高的已存在文件。
_避免使用_：多个配置文件、settings、dotenv

**凭据回退**：
`web.apiKey` 字面值优先，缺失时读取 `web.apiKeyEnv`（默认 `DEEPSEEK_API_KEY`）指向的环境变量。
_避免使用_：默认密钥、内置密钥

### 技能发现与引用

**嵌套 skill**：
位于另一个 skill 目录内部、因 pi 发现规则「命中即停」而不可见的 `SKILL.md`。
_避免使用_：子 skill、深层 skill、二级 skill

**隐藏 skill**：
本域插件判定为嵌套、需经 `skillPaths` 补交给宿主加载的 skill；与「嵌套 skill」指同一对象，强调其相对宿主默认发现结果不可见。
_避免使用_：漏网 skill

**`$` 引用**：
用户输入中 `$<skill-name>` 形态的 skill 引用；由本域插件在提交前展开为 skill 正文，可出现在任意位置、可多个。
_避免使用_：美元引用、skill 变量、skill 宏

**声明优先**：
同名冲突时宿主既有（顶层）skill 胜出；`skillPaths` 后加载，故不覆盖顶层声明。
_避免使用_：嵌套优先

### Web 能力

**搜索结果**：
DeepSeek 官方 Search API 返回的结构化条目，投影为 Harness 的便携形态 `{ url, title?, snippet?, summary?, publishedAt? }`；排序专用字段（`rerank_score`、`authority`、`site_name`、`site_icon`）不模型可见。多查询结果按轮转合并、按 URL 去重并封顶，摘要折叠空白后截断。
_避免使用_：搜索问答、answer、全字段透传

**web 工具**：
本域工具包注册的两个模型工具：`web_search`（DeepSeek 官方 Search API，`POST /v1/tools/search`，唯一模型参数为 `queries: string[]`）与 `web_fetch`（DeepSeek 官方 Fetch API，`POST /v1/tools/fetch`，唯一模型参数为 `url`，返回 `{ url, statusCode, body, truncated }`）；两者默认不激活，共用一个开关 `tools.webTools`。
_避免使用_：Anthropic web_search server tool、直连抓取、MCP 工具、web seam

**部署策略**：
不属于模型参数、只由 JSON 配置决定的检索策略：每次 Search 的 `count`、`need_content`（恒 false）、`ori_question`（由会话自动注入）、查询/结果/摘要/输出上限与超时。
_避免使用_：模型参数、提示词约束、硬编码常量

### 会话命名

**会话命名**：
首个用户输入到达时，用会话当前模型生成短标题并经 `pi.setSessionName()` 落库；生成前先剔除 skill 调用（`<skill>` 块与 `/skill:` 命令），失败时退化为输入的确定性截断。
_避免使用_：重命名会话、总结会话

### Orchestrator

**Orchestrator 模式**：
`tools.orchestrator` 打开后由 `/orchestrator` 选择的会话状态：列表只有 `开` / `关`，Enter 写当前分支的 `orchestrator-mode` entry，`Ctrl+S` 同时写全局默认 `orchestrator.always`；生效值 = 开关 ∧（会话覆盖 ?? 全局默认）。旧的 `nanoFlow` / `nano-flow` 配置名与 entry 名已合并到 `orchestrator`，配置在加载时自动迁移。
_避免使用_：预设、preset、agentPreset

**上下文清空**：
`orchestrator` 生效时 pi 自动压缩被取消；占用率达到 `orchestrator.rotateAt` 后追加 `orchestrator-reset` 标记，`context` 只保留标记之后的模型消息并前置"恢复当前 Plan"种子。不是新建会话、不是删除会话文件。
_避免使用_：轮转、换会话、物理删除

**ask_questions**：
随 `orchestrator` 模式激活的模型工具，逐题询问用户，支持预设选项、自定义回答与跳过，问题数量不设上限。
_避免使用_：ask_user_question、questionnaire

**模型修复**：
Plan 无法通过校验时，先用 `orchestrator_read` 的 `inspect` 看原始 note 与错误，再由模型判断如何重写，用 `orchestrator_write` 的 `repair` 提交 `notes`（title/description/content）与 `index`；插件不会自动截断摘要、不会自动删除索引项。
_避免使用_：脚本化截断、自动去索引、自动改依赖

**只读恢复**：
用户说「恢复」「继续」且会话尚未加载 Plan 时，只允许 `orchestrator_read`、读文件与取证命令；报告进度后等用户第一条消息放行。
_避免使用_：自动开工、自动执行 note

### 编排

**派工**：
`orchestrator_dispatch` 把一个 Plan 交给一个 worker session；同一 Plan 同一时刻只有一个 worker，重复派工复用既有会话，`kind=pass` 先记放行再投递。入队即返回，不等 worker 跑完 —— 终态由 promise 收剑，超时由后台 watchdog abort 并注入一条消息。

**放行**：
编排方下发 `pass` 后 worker 才可把 note 置 `completed`；判断在编排方，落盘在 worker。

**按 Plan 恢复**：
恢复是显式动作，不在会话启动时自动跑：`orchestrator_read` 的 `resume <plan>` 既"选中"某个 Plan，也给出它的状态行、可推进队列、待回答/待验证与阻塞；`/orchestrator status` 是全局视图。
_避免使用_：启动对账、自动播报

**崩溃凭据**：
进程崩在未捕获异常上时落下 `interrupted.json`（`at` / `reason` / `plans[]`）后退出；它只在显式查询时展示 —— `resume <plan>` 命中本 Plan 就多一行 `上次崩溃` 并只移除该条目，`status` 列出整档后清空。

**刹车**：
不设并发上限的替代：`orchestrator_workers` 列 live 清单、按 Plan 或全部中止、退出时自动收尾。
