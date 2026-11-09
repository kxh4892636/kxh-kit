# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-配置与开关](001-配置与开关.md) | 在 pi-toolkit.json 增加 nanoFlow 配置节与 tools.nanoFlow 开关，提供 /nano-flow 的会话 on/off 与 always 默认值。 | — |
| [002-提示词与skill注入](002-提示词与skill注入.md) | 在 Nano Flow 会话注入固定提示词、GUIDE 快照、篇幅限制与每轮提醒；随包 skill 按会话通过 resources_discover 注入。 | — |
| [003-文档工具与校验](003-文档工具与校验.md) | 迁移 nano_flow_create / bind / check、11 个模板与 check-domain 校验脚本，保留全部校验规则与索引生成。 | — |
| [004-会话模式与Plan绑定](004-会话模式与Plan绑定.md) | 用会话条目保存 nano-flow-mode 与 nano-flow-binding；/nano-flow 开关与 nano_flow_bind 是唯一写入方。 | — |
| [005-上下文清空与恢复seed](005-上下文清空与恢复seed.md) | 达到 rotateAt 时写重置条目，context 按时间过滤历史，并把当前 Plan 与上一轮输出作为 seed 插回；不新建会话。 | — |
| [006-Note侧栏与详情卡](006-Note侧栏与详情卡.md) | fullscreen 右上角 Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名，点击出概述/原因/下一步详情卡。 | — |
| [007-测试与验收](007-测试与验收.md) | 补齐配置、模式、绑定、seed、校验、侧栏的单测，并做 pi 真机冒烟与领域文档收口。 | — |
