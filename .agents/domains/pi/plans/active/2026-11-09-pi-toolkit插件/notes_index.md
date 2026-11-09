# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-嵌套skill发现与$引用](001-嵌套skill发现与$引用.md) | 通过 resources_discover 补交内建扫描看不见的嵌套 SKILL.md，并在输入中用 $skill-name 补全与展开为宿主同形 skill 块。 | 004-toolkit开关面板与单一配置 |
| [002-会话自动命名](002-会话自动命名.md) | 首个用户输入到达时用当前模型生成短标题并经 pi.setSessionName 落库，失败退化为确定性截断，且不覆盖手写名称。 | 004-toolkit开关面板与单一配置 |
| [003-DeepSeek网页工具](003-DeepSeek网页工具.md) | web_search 与 web_fetch 走 DeepSeek 官方 Search/Fetch API，限额来自 JSON 配置，多查询轮转合并、按 URL 去重并封顶。 | 004-toolkit开关面板与单一配置 |
| [004-toolkit开关面板与单一配置](004-toolkit开关面板与单一配置.md) | /toolkit 复用 pi /settings 的 SettingsList 与主题，三行开关写回 pi-toolkit.json，其余参数留在同一 JSON。 | 001-嵌套skill发现与$引用, 002-会话自动命名, 003-DeepSeek网页工具 |
| [005-ask-questions工具](005-ask-questions工具.md) | 新增独立的 ask_questions 模型工具：多题、选项、自定义回答与跳过；TUI 单组件切题与提交页，非交互降级，不引入 orchestrator 逻辑。 | 004-toolkit开关面板与单一配置 |
| [006-配置与开关](006-配置与开关.md) | 在 pi-toolkit.json 增加 nanoFlow 配置节与 tools.nanoFlow 开关，提供 /nano-flow 的会话 on/off 与 always 默认值。 | — |
| [007-提示词与skill注入](007-提示词与skill注入.md) | 在 Nano Flow 会话注入固定提示词、GUIDE 快照、篇幅限制与每轮提醒；随包 skill 按会话通过 resources_discover 注入。 | — |
| [008-文档工具与校验](008-文档工具与校验.md) | 迁移 nano_flow_create / bind / check、11 个模板与 check-domain 校验脚本，保留全部校验规则与索引生成。 | — |
| [009-会话模式与Plan绑定](009-会话模式与Plan绑定.md) | 用会话条目保存 nano-flow-mode 与 nano-flow-binding；/nano-flow 开关与 nano_flow_bind 是唯一写入方。 | — |
| [010-上下文清空与恢复seed](010-上下文清空与恢复seed.md) | 达到 rotateAt 时写重置条目，context 按时间过滤历史，并把当前 Plan 与上一轮输出作为 seed 插回；不新建会话。 | — |
| [011-Note侧栏与详情卡](011-Note侧栏与详情卡.md) | fullscreen 右上角 Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名，点击出概述/原因/下一步详情卡。 | 012-测试与验收 |
| [012-测试与验收](012-测试与验收.md) | 补齐配置、模式、绑定、seed、校验、侧栏的单测，并做 pi 真机冒烟与领域文档收口。 | 011-Note侧栏与详情卡 |
| [013-dream手动维护命令](013-dream手动维护命令.md) | 新增 /dream 手动命令：扫 .agents 下全部域、每域按目录名日期取最新 21 个 active/reference Plan，把 spec、notes_index 与 plan 轨迹路径交给模型跑五个 pass，自跑 check 并 commit；无 seq 游标、无定时。 | — |
| [014-Plan轨迹落盘](014-Plan轨迹落盘.md) | 把每次 run 新增的 pi 会话条目原样复制到 `<plan>/log.jsonl` 一行，run 结束（agent_end）时写一次；文件仍在 .gitignore 内，不进版本库。 | 013-dream手动维护命令 |
| [015-定时触发dream](015-定时触发dream.md) | 用 systemd user timer 加 RPC 客户端每日在清单目录跑 /dream；print 模式实测空转，wrapper 负责锁、干净预检、超时与日志。 | 013-dream手动维护命令, 014-Plan轨迹落盘 |
| [016-校验项自动修复清单](016-校验项自动修复清单.md) | 把 nano_flow_check 的问题按确定性分三档：已自动修、可机械修（含联动风险）、无法自动修；待用户选定批次后实现。 | 015-定时触发dream |
