---
name: 'Pi'
description: 'pi 编码代理的扩展业务域：一个 @kxh4892636/pi-toolkit 包按开关提供嵌套 skill 发现与 $ 引用、会话自动命名、DeepSeek 网页搜索与抓取、向用户提问、Nano Flow 交付流程。'
metadata:
  owner: 'pi'
---

# Pi

pi 指 `@earendil-works/pi-coding-agent`。工作区以独立 pi 包 `@kxh4892636/pi-toolkit` 扩展其能力，经 `pi install` 安装，不改 pi 本体。

## Language

### 插件形态

**pi 插件**：
以工作区独立包开发、经 `pi install` 安装、通过 `package.json` 的 `pi.extensions` 提供扩展入口的 pi 扩展；本域产物。
_Avoid_：上游补丁、改动 pi 仓库、DSH 插件

**扩展接缝**：
pi 对外公开、扩展可挂载的事件与方法面（`session_start`、`resources_discover`、`input`、`ctx.ui.addAutocompleteProvider`、`pi.registerTool`、`pi.registerCommand`、`pi.setSessionName`）。
_Avoid_：hook、provider、注册表

**工具包（toolkit）**：
本域唯一的 pi 包 `@kxh4892636/pi-toolkit`：把五个能力收在一个包里，由 `/toolkit` 面板逐项开关。
_Avoid_：插件集合、多个 pi 包

### 开关与配置

**开关**：
`/toolkit` 面板中的一行 on/off，对应 `pi-toolkit.json` 的 `tools.<key>`；五个开关是 `nestedSkills`、`sessionName`、`webTools`、`askQuestions`、`nanoFlow`，默认全部关闭。
_Avoid_：feature flag、环境变量开关

**默认关闭**：
未写配置或配置缺省时，所有开关均为 `false`；插件加载不激活工具、不发现嵌套 skill、不展开 `$`、不自动命名，直到用户在 `/toolkit` 中显式打开。
_Avoid_：默认全开、安装即可用

**开关面板**：
`/toolkit` 打开的 TUI 屏幕：复用 pi `/settings` 的组件与交互（带边框的 `SettingsList`、可搜索、Enter/Space 切换、Esc 关闭），面板只改开关，其它参数留在 JSON。
_Avoid_：配置向导、子菜单

**插件配置**：
`~/.pi/agent/pi-toolkit.json`（项目 `.pi/` 可覆盖，`PI_TOOLKIT_CONFIG` 指定路径最高优先）承载全部开关与可配置项的唯一 JSON 文件；按节深合并，`/toolkit` 写回优先级最高的已存在文件。
_Avoid_：多个配置文件、settings、dotenv

**凭据回退**：
`web.apiKey` 字面值优先，缺失时读取 `web.apiKeyEnv`（默认 `DEEPSEEK_API_KEY`）指向的环境变量。
_Avoid_：默认密钥、内置密钥

### 工具

**嵌套 skill**：
位于另一个 skill 目录内部、因 pi 发现规则「命中即停」而不可见的 `SKILL.md`。
_Avoid_：子 skill、深层 skill、二级 skill

**`$` 引用**：
用户输入中 `$<skill-name>` 形态的 skill 引用；由本域插件在提交前展开为 skill 正文，可出现在任意位置、可多个。
_Avoid_：美元引用、skill 变量、skill 宏

**声明优先**：
同名冲突时宿主既有（顶层）skill 胜出；`skillPaths` 后加载，故不覆盖顶层声明。
_Avoid_：嵌套优先、注册顺序优先

**会话命名**：
首个用户输入到达时，用会话当前模型生成短标题并经 `pi.setSessionName()` 落库；生成前先剔除 skill 调用（`<skill>` 块与 `/skill:` 命令），失败时退化为输入的确定性截断。
_Avoid_：重命名会话、总结会话

**web 工具（pi-deepseek-web）**：
本域工具包注册的两个模型工具：`web_search`（DeepSeek 官方 Search API，`POST /v1/tools/search`，唯一模型参数为 `queries: string[]`）与 `web_fetch`（DeepSeek 官方 Fetch API，`POST /v1/tools/fetch`，唯一模型参数为 `url`，返回 `{ url, statusCode, body, truncated }`）；两者默认不激活，共用一个开关 `tools.webTools`。
_Avoid_：Anthropic web_search server tool、直连抓取、MCP 工具、web seam

**提问工具（ask_questions）**：
向用户提出一个或多个问题并阻塞等待作答的模型工具；每题最多 3 个预设选项，也可自定义回答或跳过。TUI 用单个组件管理全部题目（切题、回改、独立的「提交」页），rpc / print 退回顺序问答，无交互界面时返回 `needs=answer` 登记而不报错。
_Avoid_：问答表单、确认弹窗、orchestrator 工具

### Nano Flow

**Nano Flow 会话**：
通过 `/nano-flow` 打开、且 `/toolkit` 的 `nano-flow` 开关也开着的会话；只有它注入 Nano Flow 提示词、三个 `nano_flow_*` 工具、随包 skill 与 Note 侧栏。
_Avoid_：Agent 预设、全局模式

**会话模式**：
当前会话是否运行 Nano Flow，存 `nano-flow-mode` 自定义条目；未记录时取 `pi-toolkit.json` 的 `nanoFlow.always`，生效值再与工具开关相与。
_Avoid_：开关状态、preset

**Plan 绑定**：
`nano_flow_bind` 写入 `nano-flow-binding { planPath, cwd, boundAt }` 的会话条目；同一会话最后一条生效，决定 Note 侧栏与恢复 seed 指向哪个 Plan。
_Avoid_：全局绑定表、当前 Plan

**上下文清空**：
达到 `rotateAt × contextWindow` 时写 `nano-flow-reset { at, seed }`；`context` 钩子丢掉早于 `at` 的消息并注入 seed，会话 JSONL 保留完整历史。
_Avoid_：会话轮转、会话删除、压缩

**恢复 seed**：
清空后作为首条 user 消息注入的文本：当前 Plan + 上一轮 assistant 输出（`<rotation-last-output>`）；本轮用户输入不重复包裹。
_Avoid_：摘要、handoff prompt

**Note 侧栏**：
fullscreen 右上角 overlay：只列当前绑定 Plan 的未完成 note，行 = 中文状态 + note 名；点击某行后，详情卡悬浮在该行左下侧（顶端与该行对齐、右缘离侧栏 2 列），标题行右端带 `×`，`×` 或 Esc 关闭，`turn_end` 刷新一次。
_Avoid_：看板、dock、悬浮提示、居中弹窗

**Nano Flow 设置**：
`pi-toolkit.json` 的 `nanoFlow` 节：8 项篇幅上限 + `rotateAt` + `always`；只改 JSON，不做设置界面。
_Avoid_：nano-flow.json、设置弹窗

**搜索结果**：
DeepSeek 官方 Search API 返回的结构化条目，投影为 Harness 的便携形态 `{ url, title?, snippet?, summary?, publishedAt? }`；排序专用字段（`rerank_score`、`authority`、`site_name`、`site_icon`）不模型可见。多查询结果按轮转合并、按 URL 去重并封顶，摘要折叠空白后截断。
_Avoid_：搜索问答、answer、全字段透传
