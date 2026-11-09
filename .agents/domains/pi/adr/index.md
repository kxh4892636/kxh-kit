# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-三工具合并为pi-toolkit并由开关面板启停](001-三工具合并为pi-toolkit并由开关面板启停.md) | 嵌套 skill、会话命名与 DeepSeek 网页工具收进一个 pi 包，用 /toolkit 的 /settings 式面板逐项开关，全部配置落一个 JSON。 | accepted |
| [002-上下文按重置时间过滤替代轮转](002-上下文按重置时间过滤替代轮转.md) | 达到 rotateAt 时写重置条目，context 按时间过滤旧消息并注入 Plan + 上一轮输出的 seed；不新建或删除会话。 | accepted |
| [003-模式与绑定存会话条目](003-模式与绑定存会话条目.md) | Nano Flow 的开关状态与 Plan 绑定写 session 自定义条目；不建全局绑定表、不做死会话清理。 | accepted |
