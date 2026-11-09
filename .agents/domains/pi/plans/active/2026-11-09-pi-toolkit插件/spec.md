---
name: 'pi-toolkit插件'
description: '按 dsh-toolkit 的设计重建 pi 工具包：嵌套 skill 与 $ 引用、会话自动命名、DeepSeek 网页工具、ask_questions，由 /toolkit 面板逐项开关，全部配置落一个 JSON。'
status: 'in_progress'
---

# pi-toolkit插件

## 问题

`packages/pi-toolkit` 在 2026-11-08 被整体删除，四个能力（嵌套 skill 与 `$` 引用、会话自动命名、DeepSeek 网页搜索与抓取、ask_questions）随之消失，`~/.pi` 里只剩指向已删目录的失效包声明。用户要求按 `dsh-toolkit` 的设计重建：一个包、每个工具独立开关、UI 与 pi 的 `/settings` 同形，并且 pi-toolkit 的全部配置统一用一个 JSON 维护。

## 方案

- 恢复 `packages/pi-toolkit`，入口 `src/index.ts` 只做装配：读一次设置、注册 `/toolkit`、把三个工具接上各自的接缝。
- `src/settings.ts` 是唯一配置层：`~/.pi/agent/pi-toolkit.json` → `<cwd>/.pi/pi-toolkit.json` → `$PI_TOOLKIT_CONFIG` 深合并，缺省值内建，`/toolkit` 写回最高优先级的已存在文件。
- `src/panel.ts` 复用宿主 `SettingsList` / `getSettingsListTheme()` / `DynamicBorder`，三行开关（`nested-skill`、`session-name`、`pi-deepseek-web`），默认全关。
- `src/skills/*`：`resources_discover` 补交内建扫描看不见的嵌套 `SKILL.md`；`$` 触发补全；提交前把可解析的 `$name` 展开成与宿主 `/skill:` 同形的 `<skill>` 块。
- `src/naming/*`：首个用户输入到达时用当前模型生成标题并经 `pi.setSessionName()` 落库；先剔除 skill 调用，模型不可用或失败时退化为确定性截断。
- `src/web/*`：`web_search` 与 `web_fetch` 走 DeepSeek 官方 Search/Fetch API（`POST /v1/tools/search`、`POST /v1/tools/fetch`），模型只能给查询与 URL，其余是部署策略。
- `src/ask/*`：`ask_questions` 让模型一次提出一到多个问题并阻塞等待；TUI 用一个组件管理全部题目，另有独立「提交」页，未作答会拦下提交；非交互退回顺序问答，无 UI 时返回 `needs=answer` 登记。**不引入 orchestrator 的任何逻辑**。

## 已排除的备选

- **保留三个独立包、各读各的配置**：与「一份配置 + 一个面板」直接冲突，且安装顺序会互相牵制。
- **把 web 工具继续拆成 `pi-deepseek-web` 子包、由 toolkit 依赖**：pi 的包安装不解决跨包配置共享，用户仍需装两次；工具身份仍在 `/toolkit` 行里保留 `pi-deepseek-web` 名称。
- **网页搜索走 Anthropic Messages + 服务端 `web_search` 工具**：已被官方 Search/Fetch API 取代，旧方案在 2026-10-17 退役。
- **会话命名做成模型工具让模型自己调用**：命名应在首个输入时自动发生，工具调用时机不可控，且会污染工具目录。
- **面板里编辑数值参数**：与 pi `/settings` 的开关语义不一致，且 pi 没有为扩展配置提供 schema 渲染；参数只留在 JSON。

## 约束与澄清

- 2026-11-09（原始要求）：以 `dsh-toolkit` 为设计来源，每个工具具有自己的开关，UI 参考 pi 的 `/settings`。
- 2026-11-09（原始要求）：嵌套 skill 工具在 pi 中以 `$skill-name` 触发，而不是 dsh 的目录补交形态。
- 2026-11-09（原始要求）：网页工具按官方文档复刻 dsh 的 web search/fetch 契约，pi-toolkit 所有配置统一用一个 JSON。
- 2026-11-09（原始要求）：先不接 `log.jsonl`；后续移植 nano-flow 工具时再确认。
- 2026-11-09（已确认）：三个工具的开关默认关闭；打开前不注册激活工具、不发现、不展开、不命名。
- 2026-11-09（补充要求）：补上历史 `ask_questions` 工具，但它只能作为独立工具存在；orchestrator 的状态、账本、派工、提示词与 skill 一律不引入。

## 范围

- `packages/pi-toolkit` 源码、单测、示例配置与 README（含 `ask_questions`）。
- 本机 `~/.pi` 的失效包声明清理，安装 `packages/pi-toolkit`，并用非交互会话冒烟。
- 本域文档（CONTEXT、ADR、Plan 与 note）。

## 非范围

- `log.jsonl` 轨迹、nano-flow 工具与预设的移植。
- 修改 pi 上游或引入自定义 provider seam。
- npm 发布与真机 TUI 的逐键验收；面板交互由单测覆盖，最终以用户验收为准。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [001-嵌套skill发现与$引用](001-嵌套skill发现与$引用.md) | 通过 resources_discover 补交内建扫描看不见的嵌套 SKILL.md，并在输入中用 $skill-name 补全与展开为宿主同形 skill 块。 | blocked | 等待用户验收 | 在工作区打开 nestedSkills 后输入 $nano-flow-cli 验证补全与展开 | 004-toolkit开关面板与单一配置 |
| [002-会话自动命名](002-会话自动命名.md) | 首个用户输入到达时用当前模型生成短标题并经 pi.setSessionName 落库，失败退化为确定性截断，且不覆盖手写名称。 | blocked | 等待用户验收 | 打开 sessionName 后新建会话发送首条输入，确认会话选择器出现模型生成的标题 | 004-toolkit开关面板与单一配置 |
| [003-DeepSeek网页工具](003-DeepSeek网页工具.md) | web_search 与 web_fetch 走 DeepSeek 官方 Search/Fetch API，限额来自 JSON 配置，多查询轮转合并、按 URL 去重并封顶。 | blocked | 等待用户验收 | 配置 web.apiKey 后打开 webTools，各调用一次 web_search 与 web_fetch | 004-toolkit开关面板与单一配置 |
| [004-toolkit开关面板与单一配置](004-toolkit开关面板与单一配置.md) | /toolkit 复用 pi /settings 的 SettingsList 与主题，三行开关写回 pi-toolkit.json，其余参数留在同一 JSON。 | blocked | 等待用户验收 | 在交互式 pi 里运行 /toolkit，逐个切换开关并确认 JSON 写回与重启后保持 | 001-嵌套skill发现与$引用, 002-会话自动命名, 003-DeepSeek网页工具 |
| [005-ask-questions工具](005-ask-questions工具.md) | 新增独立的 ask_questions 模型工具：多题、选项、自定义回答与跳过；TUI 单组件切题与提交页，非交互降级，不引入 orchestrator 逻辑。 | blocked | 等待用户验收 | 打开 askQuestions 后在交互式会话让模型调用 ask_questions，验证切题、提交与未答拦截 | 004-toolkit开关面板与单一配置 |
