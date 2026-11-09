# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-嵌套skill发现与$引用](001-嵌套skill发现与$引用.md) | 通过 resources_discover 补交内建扫描看不见的嵌套 SKILL.md，并在输入中用 $skill-name 补全与展开为宿主同形 skill 块。 | 004-toolkit开关面板与单一配置 |
| [002-会话自动命名](002-会话自动命名.md) | 首个用户输入到达时用当前模型生成短标题并经 pi.setSessionName 落库，失败退化为确定性截断，且不覆盖手写名称。 | 004-toolkit开关面板与单一配置 |
| [003-DeepSeek网页工具](003-DeepSeek网页工具.md) | web_search 与 web_fetch 走 DeepSeek 官方 Search/Fetch API，限额来自 JSON 配置，多查询轮转合并、按 URL 去重并封顶。 | 004-toolkit开关面板与单一配置 |
| [004-toolkit开关面板与单一配置](004-toolkit开关面板与单一配置.md) | /toolkit 复用 pi /settings 的 SettingsList 与主题，三行开关写回 pi-toolkit.json，其余参数留在同一 JSON。 | 001-嵌套skill发现与$引用, 002-会话自动命名, 003-DeepSeek网页工具 |
| [005-ask-questions工具](005-ask-questions工具.md) | 新增独立的 ask_questions 模型工具：多题、选项、自定义回答与跳过；TUI 单组件切题与提交页，非交互降级，不引入 orchestrator 逻辑。 | 004-toolkit开关面板与单一配置 |
