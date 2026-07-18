# Frontend API

## Transport 与请求入口

- `src/app/config.ts` 提供 `API_BASE_URL`，未设置时为 `http://localhost:8080`。
- `src/app/providers.tsx` 装配 Connect Web transport、Connect Query 和 TanStack Query；QueryCache 在请求终端用 `console.error` 记录一次失败。
- `src/libs/api/use-market.ts` 是页面业务请求入口；`libs/api` 是稳定边界，不拆分。
- `useSecurities()` 调用 `listSecurities`；`useDailyBars(symbol)` 调用 `getDailyBars`，发送 `qfq`，空 symbol 时禁用请求。

组件只消费 hook 返回的加载、刷新、错误和 protobuf 数据，不直接依赖 transport 或生成 client。

## 生成客户端

`src/libs/api/gen/etf-service/**` 来自后端 proto 和 `vp run gen`，不手写。`connectrpc.config.json` 的 backend 为 `etf-service`，输出目录是 `src/libs/api/gen/etf-service`。

同步顺序见 [../development-flow.md](./../development-flow.md)。

## 领域边界例外

生成 protobuf 类型是前端结构契约。ETF dashboard 不在 hook 或组件中再次验证 RPC response，也不为 `VITE_API_BASE_URL` 增加运行时 schema/validator；服务端和 Connect 层负责输入、外部数据与错误语义。前端 E2E 只验证用户可见成功、失败和恢复结果。
