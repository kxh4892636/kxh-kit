# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-筛分清单与工作区约定](001-筛分清单与工作区约定.md) | 定稿 9 个目录到 repos/<名> 的映射、容器仓保留与移除清单、每个子仓的骨架配置，作为后续搬迁的唯一输入。 | — |
| [002-子仓提取与历史保留](002-子仓提取与历史保留.md) | 用 git subtree split 抽出九条目录历史并挂到 repos/<名>，整目录搬走保住 ignored 私有内容；容器仓忽略 repos/，原 apps/ 与 packages/ 已清空删除。 | 001-筛分清单与工作区约定 |
| [003-子仓独立化改造](003-子仓独立化改造.md) | 九个仓各自带 toolchain、锁文件与真实版本依赖：catalog 全部固化为真实版本，tsconfig 指向仓内基线，各仓 install/check/test/build 通过并已提交。 | 002-子仓提取与历史保留 |
| [004-插件改走GitHub分发并切换wiki依赖](004-插件改走GitHub分发并切换wiki依赖.md) | 实测结论：私有仓的 Release 资产与 raw 链接都需要鉴权，pnpm 无法匿名拉取；浏览器上传资产受 bsk 控制上下文限制未跑通，wiki 暂用 file: 同级依赖，切换条件写清。 | 002-子仓提取与历史保留, 006-GitHub建仓并推送 |
| [005-领域文档路径修正](005-领域文档路径修正.md) | 把 .agents 活文档与 scripts 里的 apps/、packages/ 路径全部改成 repos/，历史 Plan 与 GUIDE.md 不动；nano_flow_check 重新生成 CONTEXT-MAP。 | 002-子仓提取与历史保留 |
| [006-GitHub建仓并推送](006-GitHub建仓并推送.md) | 浏览器操作在 kxh4892636 下建了 8 个 private 仓库并推完 main；etf 因 GitHub 上已有同名 public 仓库（内容是别的项目）未推，等用户定名。 | 002-子仓提取与历史保留, 004-插件改走GitHub分发并切换wiki依赖 |
| [007-工作区真机验收](007-工作区真机验收.md) | 容器仓零代码依赖、九个子仓各自 install/check/test/build 通过的证据；etf 未推远端、插件资产分发未定，两项挂起。 | 003-子仓独立化改造, 006-GitHub建仓并推送 |
| [008-工作区子仓清单](008-工作区子仓清单.md) | 在容器仓根新增 workspace.yaml，逐个登记子仓名称、GitHub 地址、分支与 repos/ 下相对路径，作为工作区唯一的仓库索引。 | 001-筛分清单与工作区约定 |
| [009-容器仓改名awesome](009-容器仓改名awesome.md) | GitHub 上的容器仓 kxh4892636/kxh-kit 改名为 kxh4892636/awesome，本地 origin 同步改址并推送，工作区目录名保持不变。 | 006-GitHub建仓并推送 |
