# 以进程内 Fresh Session 运行 One-shot Subagent

`pi-nano-subagent` 通过进程内 Pi SDK 为每次前台委派创建 one-shot Fresh Subagent：它共享父级 cwd、继承调用时的模型与 thinking level、重新加载适用的 context files，但不继承父对话。Subagent 只获得固定的 `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls` 工作工具及 ADR-0006 允许时的递归委派能力，不自动加载其他 extensions、skills 或 prompt templates；该边界以更少启动与协议复杂度换取弱于独立进程的故障隔离。

## Considered Options

- **进程内 Pi SDK + Fresh Session（选定）**：直接复用 Pi agent 能力，无需管理子进程、JSON 事件协议和临时 prompt 文件，同时保留独立上下文窗口。
- **独立 Pi subprocess**：符合 Pi 官方 subagent 示例并提供更强进程隔离，但引入进程启动、事件解析、终止升级和宿主配置重载成本；被拒绝。
- **fork 父会话历史**：适合依赖既有对话的延续任务，但不能卸载父会话上下文，且与自包含任务契约冲突；被拒绝。

## Consequences

- 委派任务必须自包含；Fresh Subagent 不知道父对话中的隐含决定。
- 项目 context 与写入能力可用，但其他 extension 工具不会因宿主已安装而隐式进入 Subagent。
- 每条完成、失败与取消路径都必须中止剩余工作并释放进程内 session；同进程共享意味着实现错误仍可能影响宿主。
