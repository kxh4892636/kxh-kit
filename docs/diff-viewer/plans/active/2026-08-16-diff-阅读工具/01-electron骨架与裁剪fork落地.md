---
status: in_progress
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

- [ ] `pnpm dev` 启动应用，指向本地仓库路径后能渲染该仓库的 diff，unified/split 可切换。

## 上下文

- [spec.md](spec.md)
- [ADR-0001 裁剪 fork difit，与上游脱钩](../../adr/0001-裁剪-fork-difit.md)
- fork 源：`.temp/difit/`（MIT，v5.0.11）

## 下一步

/implement
