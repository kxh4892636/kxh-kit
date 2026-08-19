# Context Map

## Contexts

- [common](./docs/common/CONTEXT.md) - 由多个业务域共同贡献的基础业务域。
- [diff-viewer](./docs/diff-viewer/CONTEXT.md) - Diff Viewer 业务域：Electron 桌面的多仓库 git diff 阅读工具。
- [anki-cli](./docs/anki-cli/CONTEXT.md) - Anki CLI 业务域：通过 AnkiConnect 以命令行控制 Anki 的 CLI 工具。

## Relationships

- **Loop Kit → Common**：Loop Kit 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。
