# Context Map

## Contexts

- [common](./docs/common/CONTEXT.md) - 由多个业务域共同贡献的基础业务域。
- [nano-flow](./docs/nano-flow/CONTEXT.md) - Nano Flow 业务域：从想法路由到经门禁验证交付的 Flow，以单一 CLI 收口内建子命令并管理 Nano Flow 与 CLI 路由 skill。
- [nano-mem](./docs/nano-mem/CONTEXT.md) - Nano Mem 业务域：通过 agent skill 与本地 CLI 管理记忆的形成、检索、使用、衰减、恢复和删除。
- [diff-viewer](./docs/diff-viewer/CONTEXT.md) - Diff Viewer 业务域：Electron 桌面的多仓库 git diff 阅读工具。
- [herdr](./docs/herdr/CONTEXT.md) - Herdr 扩展业务域：观察 coding agent 运行状态并执行可审计的自动化工作流。
- [dsh](./docs/dsh/CONTEXT.md) - DSH 扩展业务域：工作区自研的 DeepSeek Harness 插件。
- [dsh-manager](./docs/dsh-manager/CONTEXT.md) - Windows 原生 DSH 管理工具：官方 DSH 的更新、端口启动与保活。

## Relationships

- **Nano Flow → Common**：Nano Flow 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。
- **Nano Mem → Common**：Nano Mem 使用 Common 定义的受管 skill 与 skill 安装状态管理 `nano-mem` skill。
- **DSH → Nano Flow**：DSH 插件使 Nano Flow 以嵌套 skill 形式分发的主流程 skill 能被发现与调用。
