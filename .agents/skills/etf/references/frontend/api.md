# Frontend API

## Transport

- `src/app.tsx` 使用 `createConnectTransport` 创建 Connect Web transport。
- `VITE_API_BASE_URL` 控制后端地址；未设置时默认 `http://localhost:8080`。
- 浏览器直接调用 `etf-service`，后端需要 CORS 放行。

## Hooks

- `src/hooks/use-market.ts` 是前端业务请求入口。
- `useSecurities()` 调用 `listSecurities`，返回证券列表和基础加载/错误状态。
- `useDailyBars(symbol)` 调用 `getDailyBars`，默认 `adjType` 是 `qfq`。
- `useDailyBars` 在 `symbol` 为空时禁用请求，避免后端记录无意义错误。

## 生成客户端

- 生成客户端来自 `src/api/gen/etf-service/etf/v1/etf_pb.ts` 和 `etf-EtfService_connectquery.ts`。
- 生成脚本会校验 backend id、输出目录必须位于 `src/api/gen` 内，并在生成前删除旧输出目录。
- 修改生成文件前，应回到 proto 或生成脚本确认源头。

## 前后端契约同步

前后端契约同步顺序统一维护在 `../development-flow.md`。
