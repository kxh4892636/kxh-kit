# Frontend Development

## 项目结构

- `apps/etf-dashboard/package.json`：前端包信息、脚本和依赖。
- `apps/etf-dashboard/connectrpc.config.json`：后端 IDL 到前端生成目录的映射。
- `apps/etf-dashboard/scripts/gen-rpc-client.mjs`：根据配置生成 ConnectRPC TypeScript client。
- `apps/etf-dashboard/src/api/gen/etf-service/`：生成的 ConnectRPC TypeScript API 客户端，只读。
- `apps/etf-dashboard/e2e/*.md`：浏览器验收场景。

## 常用命令

在 `apps/etf-dashboard` 下执行：

- `vp run dev`：启动前端开发服务器，常用地址是 `http://localhost:5173`。
- `vp run gen`：根据 `connectrpc.config.json` 生成全部后端 RPC client。
- `vp run build`：执行 `tsc -b && vp build`。
- `vp run preview`：预览构建产物。
- `vp run check`：运行 Vite+ 检查。

## 依赖关系

- 前端 package 名称是 `@kxh-awesome/etf-dashboard`。
- 依赖 `apps/etf-service` 提供的 ConnectRPC proto 契约。
- 不通过 workspace import 后端 Go 代码；接口契约来自 `src/api/gen/etf-service/` 生成产物。
- `connectrpc.config.json` 当前只有一个 backend：`etf-service`，`idl` 是 `../etf-service`，输出是 `src/api/gen/etf-service`。

## 生成物

- `dist/`、`logs/`、`node_modules/`、`*.tsbuildinfo` 和 `src/api/gen/etf-service/` 不手动编辑。
- 后端 proto 改动后，前端通过 `vp run gen` 更新生成客户端。
