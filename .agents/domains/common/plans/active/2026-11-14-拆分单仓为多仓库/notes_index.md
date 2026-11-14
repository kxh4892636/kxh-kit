# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-筛分清单与工作区约定](001-筛分清单与工作区约定.md) | 定稿 9 个目录到 repos/<名> 的映射、容器仓保留与移除清单、每个子仓的骨架配置，作为后续搬迁的唯一输入。 | — |
| [002-子仓提取与历史保留](002-子仓提取与历史保留.md) | 用内置 git subtree split 按目录抽出历史，整目录搬进 repos/<名> 后把历史挂上去，原目录删除、容器仓忽略 repos/；被忽略的私有内容仍留在磁盘且不被跟踪。 | 001-筛分清单与工作区约定 |
| [003-子仓独立化改造](003-子仓独立化改造.md) | 待补。 | — |
| [004-插件改走GitHub分发并切换wiki依赖](004-插件改走GitHub分发并切换wiki依赖.md) | 两个 docusaurus 插件不打 npm：在各自 GitHub 仓里用 pnpm pack 出 tgz 挂 Release，wiki 依赖改成 tarball URL 并删掉 prebuild 的 --filter，站点独立 build 通过。 | 002-子仓提取与历史保留, 006-GitHub建仓并推送 |
| [005-领域文档路径修正](005-领域文档路径修正.md) | 待补。 | — |
| [006-GitHub建仓并推送](006-GitHub建仓并推送.md) | 待补。 | — |
| [007-工作区真机验收](007-工作区真机验收.md) | 待补。 | — |
