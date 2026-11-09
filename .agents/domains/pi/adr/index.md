# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-三工具合并为pi-toolkit并由开关面板启停](001-三工具合并为pi-toolkit并由开关面板启停.md) | 嵌套 skill、会话命名与 DeepSeek 网页工具收进一个 pi 包，用 /toolkit 的 /settings 式面板逐项开关，全部配置落一个 JSON。 | accepted |
| [002-上下文按重置时间过滤替代轮转](002-上下文按重置时间过滤替代轮转.md) | 达到 rotateAt 时写重置条目，context 按时间过滤旧消息并注入 Plan + 上一轮输出的 seed；不新建或删除会话。 | accepted |
| [003-模式与绑定存会话条目](003-模式与绑定存会话条目.md) | Nano Flow 的开关状态与 Plan 绑定写 session 自定义条目；不建全局绑定表、不做死会话清理。 | accepted |
| [004-dream由命令手动触发且不依赖seq游标](004-dream由命令手动触发且不依赖seq游标.md) | dream 由 /dream 手动触发，不建定时任务、不用 seq 游标；输入是 plan 目录的轨迹副本与 spec/note，GUIDE.md 归 dream 维护。 | accepted |
| [005-plan轨迹用会话条目副本按run落盘](005-plan轨迹用会话条目副本按run落盘.md) | 每个 Plan 目录下写 `<plan>/log.jsonl`：每个 run 一行、entries 是 pi 会话条目原样副本，run 结束写一次；gitignore 排除，不进版本库。 | accepted |
