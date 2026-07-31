# Frontend Development

## 项目地图

- `package.json`：package `@kxh-awesome/etf-dashboard` 与脚本。
- `connectrpc.config.json`：后端 IDL 到 `src/libs/api/gen` 的映射。
- `scripts/gen-rpc-client.mjs`：ConnectRPC TypeScript client 生成脚本。
- `src/app`、`src/pages`、`src/features`、`src/libs`、`src/common`：源码一级边界。
- `e2e/`：Playwright E2E 资产（config 在应用根 `playwright.config.ts`）；单测/组件测试与源文件同目录（`*.test.ts` / `*.test.tsx`）。

`dist/**`、`logs/**`、`node_modules/**`、`*.tsbuildinfo` 和 `src/libs/api/gen/**` 不手写。`src/libs/api` 不拆分；现有 `index.*` 不重命名。

## 命令

在 `apps/etf-dashboard` 执行：

- `vp run dev`：启动开发服务，默认 `http://localhost:5173`。
- `vp run gen`：根据 `connectrpc.config.json` 生成全部 RPC client。
- `vp run check`：格式、lint 和类型检查。
- `vp run build`：执行 `tsc -b && vp build`。
- `vp run preview`：预览构建产物。
- `vp run test`：Vitest 单测（node）与组件测试（browser mode）。
- `vp run test:e2e`：Playwright E2E，进程编排见 [../test.md](./../test.md)。

实现完成后执行 check/test/build，并按 [../verification.md](./../verification.md) 跑受影响的 E2E 场景。
