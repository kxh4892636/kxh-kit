---
status: completed
blocked_by: []
---

# Electron 骨架与裁剪 fork 落地

## 交付

本地 `pnpm dev` 启动 Electron 应用，对启动参数指定的单个本地 git 仓库，端到端看到其 diff（unified/split 可切换）——difit client 与 GitDiffParser 在 Electron 内无 HTTP server 运行。

## 范围

做：

- pnpm workspace 新包 `apps/diff-viewer`（Electron main / preload / renderer，TypeScript + Vite + React 19 + Tailwind v4）。
- 裁剪 fork：从 `.temp/difit` 拷入 client、GitDiffParser、共享 types/utils；裁掉 CLI、Express server、heartbeat 自杀逻辑、site；与上游脱钩。
- 传输层：preload 注入 fetch bridge，将 `/api/*` 路由到主进程 IPC handler；`/api/watch` 的 SSE 用 EventSource polyfill + `webContents.send` 模拟；blob 二进制经 IPC 传 ArrayBuffer。
- 测试基建：Vitest 单元/组件测试（与实现同级 `*.test.ts(x)`，组件用 Testing Library + happy-dom）+ Playwright Electron e2e 骨架（`e2e/`）。
- 评论沿用 fork 的 localStorage 暂存（落盘归 05）。

不做：目录扫描、多仓库、SSH、编辑器打开、评论落盘、默认对比。

## 直接依赖

无。

## 验收

- [x] `pnpm dev` 启动应用，指向本地仓库路径后能渲染该仓库的 diff，unified/split 可切换。

## 交付物与证据

- 交付物：`apps/diff-viewer`（Electron main/preload/renderer + fork client/GitDiffParser + fetch bridge + EventSource polyfill + 三层测试基建）。
- 合回 commit：`fd77ff4`（主体）、`c4c9cf1`（workspace 允许 electron postinstall）、`ab227ca`（双轴审查修复），merge commit `deae067`。
- 验证证据：`pnpm ready` exit 0（vp check 0 errors + 全仓 test/build 绿）；单测 56 文件 657 passed + 1 skipped；e2e `e2e/diff-render.spec.ts` 1 passed（Playwright 真起 Electron 渲染 fixture 仓库 diff 并切换 unified/split，即验收项的自动化等价证据）。
- code review：Standards + Spec 双轴各经独立 sub-agent 审查（dv/01-skeleton vs main），硬性违规与确认 smell 已在 `ab227ca` 修复。
- 接受偏差（内容冻结前记录）：
  - `git-diff.test.ts` 超 987 行——随上游 port 豁免；
  - `src/main` 文件数超 13——用户要求测试与实现同级，优先于目录文件数规则；
  - `initial-selection.ts` 简化版默认对比（有改动→`.` vs HEAD，否则 `HEAD^..HEAD`）——「启动即看到 diff」必需，完整三点对比归 02；
  - `useFileWatch` 永不触发（`@parcel/watcher` native 不进 Electron，`/api/watch` 仅推 stub `connected`）——v1 接受，无文件变更自动刷新；上游 diff LRU 缓存随之移除以避免过期 diff；
  - fork client 改动共 3 处：`main.tsx` 接 bridge、`useHighlightedCode.ts` 显式泛型、`ImageDiffViewer.tsx` 图片经 bridge fetch 转 Object URL（修复 `<img>` 直链 404），清单登记在 `ImageDiffViewer.tsx` 文件头注释。

## 上下文

- [spec.md](spec.md)
- [ADR-0001 裁剪 fork difit，与上游脱钩](../../adr/0001-裁剪-fork-difit.md)
- fork 源：`.temp/difit/`（MIT，v5.0.11）

## 下一步

/implement
