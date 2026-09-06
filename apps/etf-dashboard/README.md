# ETF 行情看板

在仓库根目录执行：

```sh
pnpm install
pnpm run dev:etf
```

打开 Vite 输出的地址（默认 http://localhost:5173）。同一命令启动 Node 行情服务与 React 看板，Ctrl+C 停止；后端默认监听 127.0.0.1:8080。原有根 dev 命令仍启动 wiki。

前端使用 VITE_API_BASE_URL 指定后端地址，默认 http://localhost:8080。后端的 PORT、DATABASE_DSN 配置见 [服务说明](../etf-service/README.md)。前端通过后端包的类型入口推导 API 契约，浏览器产物不会加载数据库和服务端启动代码。

```sh
pnpm --filter @kxh4892636/etf-dashboard run build
pnpm --filter @kxh4892636/etf-dashboard run test:coverage
pnpm --filter @kxh4892636/etf-dashboard run test:e2e
```

组件测试与 E2E 使用本机 Chrome。E2E 自动构建并管理 Node 后端，使用本地受控行情上游、临时 SQLite、独立端口 15173/18181；端口占用时失败，不复用用户服务。可通过 ETF_E2E_FRONTEND_PORT、ETF_E2E_BACKEND_PORT 改端口。五组旅程覆盖默认行情、核心交互、窄屏、停服恢复和虚拟均线，测试结束清理自有进程与临时数据库。

当前证券、图表、均线与虚拟均线功能来自原 ETF 项目；不包含交易功能。日线仅支持前复权，历史范围受上游返回窗口限制。
