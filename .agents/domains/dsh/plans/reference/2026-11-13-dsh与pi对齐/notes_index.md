# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-提示词与模板照搬pi](001-提示词与模板照搬pi.md) | system/user/limit 提示词与 adr/context/question/note 模板换成 pi 版，删除入口/业务域/恢复与写入边界，修正 CONTEXT-MAP 注释。 | 002-删除ask与do并清理引用 |
| [002-删除ask与do并清理引用](002-删除ask与do并清理引用.md) | 删除随包 ask/do 两个 skill，并清理预设 persona、描述、README 与测试里对这两个循环的引用。 | 001-提示词与模板照搬pi |
| [003-校验脚本搬自动修复](003-校验脚本搬自动修复.md) | 把 pi 的自动修复搬进 dsh：fix.mjs、5 类修复、fixed 输出、nameProblem 单点与原子写，保留 dsh 的子进程 CLI。 | 001-提示词与模板照搬pi, 007-发布0.5.47并真机验收 |
| [004-学习skill与ponytail注入](004-学习skill与ponytail注入.md) | learning skill 换成 pi 版（短句、电报体细则、实测分布、note-metrics.py），并注入 ponytail-audit 与 ponytail-review。 | 001-提示词与模板照搬pi |
| [005-Note面板常驻与空态](005-Note面板常驻与空态.md) | dsh 的 Note dock 改为已绑定 Plan 时常驻，未完成列表为空时显示「全部完成」空态，与 pi 侧栏一致。 | 007-发布0.5.47并真机验收 |
| [006-预设改用ptc执行器](006-预设改用ptc执行器.md) | 把预设里已弃用的 dsh-agent-tool-presentation 选型器换成直接挂 dsh-tool-executor-ptc，去掉 config.mode。 | 007-发布0.5.47并真机验收 |
| [007-发布0.5.47并真机验收](007-发布0.5.47并真机验收.md) | 更新 README 与领域文档，跑包内门禁，按 0.5.47 打包安装到 web profile，重启宿主真机走查后等用户验收。 | 001-提示词与模板照搬pi, 002-删除ask与do并清理引用, 003-校验脚本搬自动修复, 004-学习skill与ponytail注入, 005-Note面板常驻与空态, 006-预设改用ptc执行器 |
| [008-dream输入扫描改为脚本](008-dream输入扫描改为脚本.md) | 把 dream 的输入扫描与游标读写收进随包 dream-scan.mjs（按 Plan+会话记 seq 上界），提示词只负责跑脚本与提交后 --mark。 | 003-校验脚本搬自动修复 |
