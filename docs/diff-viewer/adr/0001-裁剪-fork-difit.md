# 裁剪 fork difit，与上游脱钩

构建 Diff Viewer 时决定以裁剪 fork 的方式复用 difit（MIT）：将其 client（React 自研 diff 渲染、评论系统）与 GitDiffParser（simple-git 数据层）拷入 `apps/diff-viewer`，裁掉 CLI、Express server 与 heartbeat 自杀逻辑，与上游脱钩、不跟进后续更新。原因：多仓库文件树、SSH 远程、评论落盘等核心需求需要深度改造 client 与数据层，依赖上游 npm 包改不动 UI，且上游演进快（fork 时已 v5.0.11），跟进 rebase 成本高；从零重写则要放弃约 17k 行已打磨的 diff 渲染与评论资产。代价是放弃上游的功能与修复更新。

## Considered Options

- 依赖上游 npm 包嵌入（主进程起它的 server + webview）：改不动 UI，否决。
- 从零重写，只借鉴概念：重写 17k 行核心资产，代价过大，否决。
