---
status: in_progress
---

# Diff 阅读工具

## 问题

需要一个 Electron 桌面工具来阅读和评审 git diff：打开本地一个目录后自动识别其中嵌套多级的 git 仓库，以仓库和分支分组；支持不同 branch 之间、不同 commit 之间的 diff；支持多个仓库在同一视图一起 diff，并具有文件树；支持通过 SSH 打开远程主机目录；支持在选中的 diff 文件中一键打开本机 VSCode 的对应文件；支持评论并定位代码，所有评论可一键复制；diff 支持单栏和双栏。

## 方案

裁剪 fork difit（MIT，决策见 [ADR-0001](../../adr/0001-裁剪-fork-difit.md)）：将其 client（React 自研 diff 渲染、评论系统）与 GitDiffParser（simple-git 数据层）拷入 `apps/diff-viewer`，裁掉 CLI、Express server 与 heartbeat 自杀逻辑，与上游脱钩。应用内**无 HTTP server**：渲染进程的 `/api/*` fetch 由 preload 注入的 bridge 路由到 Electron IPC，主进程 handler 调 GitDiffParser；SSE 以 EventSource polyfill + IPC event 实现；降级预案为主进程内 Hono 监听 127.0.0.1 随机端口（不用 Express）。在此之上新增：嵌套仓库扫描与多仓库文件树、每仓库激活对比管理、SSH 远程执行（spawn 本机 OpenSSH，完全复用本机 ssh 配置）、评论落盘（userData JSON）与复制格式、编辑器打开。

## 已排除的备选

- 依赖上游 npm 包嵌入（主进程起 difit server + webview）：多仓库文件树、SSH、评论落盘需深度改造 client 与数据层，包嵌入改不动 UI，且上游演进快（fork 时已 v5.0.11）跟进成本高。
- 从零重写、只借鉴概念：放弃约 17k 行已打磨的 diff 渲染与评论资产，重写代价大。
- 保留 Express 起 localhost server：桌面应用无需开放端口，用户明确不希望引入 Express；若 IPC bridge 实现受阻，降级为 Hono 而非 Express。
- 远端 agent（数据层部署到远端运行）：部署与版本管理复杂，违背远端零安装。
- ssh2 npm 库实现 SSH：认证逻辑（agent、key、passphrase、known_hosts）需自己实现，代码量大；保留为降级预案。

## 实施决策

- **传输层**：无 HTTP server——preload 注入 fetch bridge（先例：difit `staticApiBridge.ts` 以 monkey-patch `window.fetch` 让全套 UI 无 server 运行）将 `/api/*` 路由到主进程 IPC handler；`/api/watch` 的 SSE 用 EventSource polyfill + `webContents.send` 模拟；blob 二进制经 IPC 传 ArrayBuffer，在 bridge 内构造 Response。降级预案：主进程 Hono 随机端口。01 落地时的事实性更新：`/api/watch` v1 仅推 stub `connected`（`@parcel/watcher` native 不进 Electron），无文件变更自动刷新，上游 diff LRU 缓存随之移除以防过期 diff；`<img src="/api/blob/...">` 直链拦截不到，ImageDiffViewer 改经 bridge fetch 转 Object URL（fork client 第 3 处改动，清单见该文件头注释）。
- **技术栈**：Electron + React 19 + Vite + Tailwind v4（继承 fork）；主进程 TypeScript。
- **测试策略**：单元、组件、e2e 三层全部代码驱动。单元测试（Vitest，覆盖主进程逻辑：GitDiffParser、扫描器、executor 等）与组件测试（Vitest + Testing Library + happy-dom，继承 difit 测试模式）的测试文件与实现文件放在**同级目录**（`foo.test.ts` / `foo.test.tsx`）；e2e（@playwright/test 驱动 Electron）驱动整个应用、无单一同级实现文件，集中在 `apps/diff-viewer/e2e/`。
- **对比矩阵**：v1 支持 ① 未提交改动（unstaged + staged vs HEAD，untracked 经 `git add --intent-to-add` 纳入）② 任意两 branch 的三点对比（默认；两点为可切换选项）③ 任意两 commit 对比（单 commit 即 `commit^..commit` 特例）。每仓库同一时刻一个激活对比，可切换。
- **默认对比**：当前分支与远程默认分支的三点对比；无远程或 detached HEAD 时降级为未提交改动 vs HEAD。
- **嵌套仓库识别**：递归扫描，发现 `.git` 即记为仓库条目并继续向其内部递归（仓中仓为父子条目）；submodule 作为子仓库条目；默认跳过 `node_modules`/`dist` 等重型目录与 `.git` 内部，深度上限 8，异步扫描带进度。
- **多仓库同视图**：单窗口、单文件树、仓库为顶层分组；勾选 N 个仓库，各自独立设置激活对比，点文件看该文件的 diff；不做跨仓库同名文件对比。
- **远程视图**：通过 SSH 打开远程主机目录，git 命令在远端执行，diff 数据传回本地渲染。SSH 执行层：主进程 spawn 本机 OpenSSH `ssh` CLI（executor 抽象：local = child_process，remote = ssh exec），**完全复用本机 ssh 配置**——`~/.ssh/config` 的 Host 别名、密钥、agent、known_hosts；ControlMaster 复用连接；远端假定 POSIX shell + git 在 PATH。连接入口支持 ssh config 的 Host 别名或 `user@host[:port]`，加远程路径的表单，历史连接存 userData。远程视图评论键 = `ssh://host/path` + 对比；编辑器按钮走 `vscode://vscode-remote/ssh-remote+host/...` 协议打开（实现受阻则 v1 禁用该按钮）。
- **评论**：锚点 = 仓库 + 文件路径 + 行号 + side（new 为主，支持 old）+ 可选代码片段快照；存储在 Electron userData 的 JSON（不污染仓库），按 仓库+对比 为键组织；一键复制为 Markdown 列表（每条含 `文件:行号`、引用代码块、评论正文），可直接粘贴给 AI。
- **编辑器打开**：v1 只支持 VSCode，代码留 editor-adapter 接缝，后续扩展 cursor/trae。
- **单栏/双栏**：unified / split 两种布局均支持、可切换（继承 difit）。
- **平台与分发**：electron-builder 产出 Windows / macOS / Linux 三平台安装包；实际运行验证仅在 Windows。
- **交付门禁**：每个 issue 的 `/verifying` 门禁 = `pnpm ready`（vp check + test + build）全绿，验收信号由对应层级的自动化测试证明（用户可感知信号以 e2e 用例为证据）；手动走查仅作补充。

## 工作环境

- 本 monorepo：pnpm@11 workspace，node >= 22.12，vite-plus（`vp`，统一工具链：oxlint/oxfmt + Vitest 4）；代码落 `apps/diff-viewer`。
- 参考实现：`.temp/difit`（MIT，v5.0.11 clone，仅作参考不入库）；difit 架构事实：React 19 + Vite + Tailwind v4 前端，Express 5 server，simple-git 数据层，Vitest + happy-dom 测试，评论存 localStorage，已有 `/api/open-in-editor` 端点与无 server 静态桥接先例（`staticApiBridge.ts`）。

## 范围

- 打开本地目录，自动识别嵌套多级 git 仓库（含 submodule）。
- 以仓库为顶层分组的文件树；每仓库的 branch/commit/未提交改动对比。
- 多仓库同一视图一起 diff。
- SSH 打开远程主机目录（复用本机 ssh 配置）。
- diff 文件一键打开本机 VSCode 对应文件（远程视图走 vscode-remote 协议）。
- 行/范围锚定评论，评论一键复制为 AI 可消费的 Markdown。
- diff 单栏/双栏切换。
- Windows / macOS / Linux 三平台打包产物。

## 非范围

- 跨仓库同名文件对比。
- cursor / trae 编辑器适配（仅留接缝）。
- GitHub PR 评审模式（difit 的 `--pr` 能力不带入 v1）。
- 应用内 HTTP server（降级预案的 Hono 仅在 IPC bridge 受阻时启用）。
- 远端 Windows 主机、SSH 连接管理器界面。
- macOS / Linux 上的实际运行验证（仅产出安装包）。

## 待定

（无）

## 上下文

- [ADR-0001 裁剪 fork difit，与上游脱钩](../../adr/0001-裁剪-fork-difit.md)
- difit 参考 clone：`.temp/difit/`（架构分析结论见「方案」与「工作环境」）
- 域术语表：[../../CONTEXT.md](../../CONTEXT.md)

## Issue

| #   | Issue                                                             | 状态        | 阻塞于 | 下一步     |
| --- | ----------------------------------------------------------------- | ----------- | ------ | ---------- |
| 01  | [Electron 骨架与裁剪 fork 落地](01-electron骨架与裁剪fork落地.md) | completed   | —      | /implement |
| 02  | [默认对比与三点对比](02-默认对比与三点对比.md)                    | completed   | 01     | /implement |
| 03  | [目录打开与嵌套仓库扫描](03-目录打开与嵌套仓库扫描.md)            | completed   | 01     | /implement |
| 04  | [多仓库文件树与同视图 diff](04-多仓库文件树与同视图diff.md)       | completed   | 03     | /implement |
| 05  | [评论持久化与一键复制](05-评论持久化与一键复制.md)                | completed   | 01     | /implement |
| 06  | [SSH 远程视图](06-ssh远程视图.md)                                 | in_progress | 03     | /implement |
| 07  | [本地 VSCode 打开](07-本地vscode打开.md)                          | pending     | 01     | /implement |
| 08  | [全平台打包](08-全平台打包.md)                                    | pending     | 01     | /implement |
