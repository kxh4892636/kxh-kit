# Context Map

## Contexts

- [common](./docs/common/CONTEXT.md) - 由多个业务域共同贡献的基础业务域。
- [diff-viewer](./docs/diff-viewer/CONTEXT.md) - Diff Viewer 业务域：Electron 桌面的多仓库 git diff 阅读工具。
- [loopx](./docs/loopx/CONTEXT.md) - LoopX 业务域：以单一 CLI 收口内建子命令，并管理 Loop Kit 与 CLI 路由 skill。

## Relationships

- **LoopX → Common**：LoopX 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。
