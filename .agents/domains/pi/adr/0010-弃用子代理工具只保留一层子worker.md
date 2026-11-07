# 弃用子代理工具，只保留一层子 worker

背景：并行办事原本有两条通道 —— 宿主装的 `@tintinweb/pi-subagents`（`Agent`、`SubagentWorkflow`、`get_subagent_result`、`steer_subagent`）与本插件的 worker。两套并行各有自己的观测面与超时：子代理的结果要靠 `get_subagent_result` 去捞，worker 的 report 与 watchdog 却挂在编排方，同一个 Plan 里会出现两种"谁负责收尾"的答案。

决策：把该包从 pi 设置里**卸载**，并行只留一条链路 —— 编排方派 worker（组），worker 至多再派一层子 worker（`depth 1`）。

理由：并行通道只该有一条，否则观测归属、超时归属与 `notes.json` 的写权都说不清。留在本插件里的一层子 worker 复用同一套句柄表语义（`renew` 续期、settle 即摘除），观测只有一条：子 worker 的 report 与超时注入**上级 worker 的会话**，编排方看到的是上级的汇总。

## Considered Options

- **两套并存**：子代理工具能力更强（worktree 隔离、按子代理覆盖模型档、可 resume），但结果要模型自己去捞，编排方看不到任何句柄；同一个 Plan 里两套并行会互相盖文件而没人报冲突。否决。
- **只留 subagents，删掉 worker 派子 worker**：等于把并行交给一个不受编排约束的通道，note 写权、放行与超时都绕过了本插件的规矩。否决。
- **卸载包 + 一层子 worker（选定）**：观测只有一条链路，深度只有一层，子 worker 改不了 notes，写权仍在本插件的规则内。

## Consequences

- 失去 worktree 隔离、按子代理覆盖模型档与 `resume` 子会话：子 worker 与上级同 cwd、同模型档，重启后子会话不恢复（与 worker 本身一致）。
- 子 worker 不可被编排方直接刹车：`orchestrator_workers` 只列编排方派的 worker（带组），要停子 worker 得 abort 它的上级；子 worker 的句柄表在 worker 会话的闭包里。
- 子 worker 改不了 `notes.json`（没有 `orchestrator_write`），note 状态与 evidence 仍由上级 worker 写；文件写权限保留，所以"撞文件"仍要靠 report 上报。
- 恢复这条通道需要重装包（`pi install npm:@tintinweb/pi-subagents`）；若重开，需要先重新讨论观测与超时的归属，本篇的成功标准是"并行只有一条链路"。

## 与其他 ADR 的关系

- 本篇只管"并行通道只留一条"。子 worker 仍然**不续、不落盘**（内存会话），这是本篇的结论之一，不是疏漏。
- worker（含临时 worker）自己的会话如何落盘与恢复另立一篇：`0011-worker会话落盘与按需恢复.md`。那篇只改变"worker 会话存哪、何时恢复"，不复活本篇否决的并行通道，也不给子 worker 加持久化。
