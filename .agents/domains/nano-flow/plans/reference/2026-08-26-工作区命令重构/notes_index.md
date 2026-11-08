# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-工作区配置crud](001-工作区配置crud.md) | 用户通过 `workspace config` 初始化工作区，并完整新增、读取、更新和移除 `workspace.yaml` 中的子仓配置项。 | — |
| [002-子仓物化crud](002-子仓物化crud.md) | 用户通过 `workspace repository` 在配置 `path` 上完整克隆、查看、更新和移除远程子仓的本地物化，不产生隐式 worktree 副作用。 | 001-工作区配置crud |
| [003-worktree生命周期crud](003-worktree生命周期crud.md) | 用户通过 `workspace worktree` 从已物化子仓克隆显式创建目标 worktree，并完整列出、切换和移除其生命周期；最终 workspace CLI 只剩三层领域资源契约。 | 002-子仓物化crud |
