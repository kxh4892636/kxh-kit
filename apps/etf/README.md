# ETF 行情应用

单一 `apps/etf` 应用包含 React 看板、Hono 行情服务与双端共享契约。Node.js >=22.12.0，在仓库根执行：

```sh
pnpm install
pnpm run dev:etf
```

打开 Vite 输出的地址（默认 http://localhost:5173）。同一命令用 `concurrently` 启动行情服务与看板，Ctrl+C 同时停止；后端默认监听 127.0.0.1:8080。也可在 `apps/etf` 内分别运行：

```sh
pnpm run dev:server
pnpm run dev:web
```

## 结构

```text
apps/etf/
├── client/                 # React + Vite + antd + Tailwind；libs 接 API，utils 放纯逻辑
├── server/                 # Hono 服务；按业务域 market 组织
│   └── market/
│       ├── handler/        # 控制层：Hono RPC 路由、Zod 校验、HTTP 错误映射
│       ├── service/        # 业务逻辑：用例、端口、域内错误
│       └── repository/     # 数据库接口 + SQLite 实现
├── shared/                 # 双端共享：ApiResponse/ApiCode 与行情契约类型
├── migrations/             # Drizzle SQL 迁移（SQLite）
└── e2e/                    # 五组浏览器旅程与受管后端
```

- `server/market/service` 与 `server/market/repository` 不导入 Hono；只有 handler 与 `server/app.ts` 等入口/装配依赖框架。
- `MarketRepository` 是数据库接口，`repository/sqlite/` 是其中一种实现；替换 MySQL/PostgreSQL 时新增同接口实现并在 `server/server.ts` 组合根替换。

## API

Hono RPC 暴露，`AppType` 从 `server/app.ts` 导出，前端经 `hcWithType` 调用。所有成功/失败响应统一为：

```ts
interface ApiResponse<T> {
  code: number;
  message: string;
  extra: Record<string, any>;
  data: T;
}
```

- 成功：`code = 0`，`data` 为业务载荷。
- 失败：`data = null`，`code` 为业务码（1001 参数无效、1002 资源不存在、1003 取消、1004 内部、1005 上游不可用、1006 上游超时、1007 路由不存在），HTTP 状态由 Hono 单独返回。
- `GET /` 健康检查；`GET /api/securities` 证券目录；`GET /api/daily-bars?symbol=...` 前复权日线，另支持 `adjType=qfq`、`startDate`、`endDate`。

## 配置与数据

在 `apps/etf` 创建可选 `.env`，或使用进程环境变量（优先）：

```dotenv
PORT=8080
DATABASE_DSN=./data/etf.sqlite
```

运行 `dev`、`start`、E2E 时以 `apps/etf` 为工作目录；迁移目录按该工作目录解析。初次启动执行 SQL migrations 与证券幂等 seed。SQLite 使用 `better-sqlite3` + Drizzle ORM，原生预编译文件不需要本机编译。

```sh
pnpm --filter @kxh4892636/etf run build     # dist/client + dist/server + dist/shared
pnpm --filter @kxh4892636/etf run start     # node dist/server/main.js
pnpm --filter @kxh4892636/etf run test:coverage
pnpm --filter @kxh4892636/etf run test:e2e
pnpm --filter @kxh4892636/etf run sync:market   # 全量同步两个证券历史
pnpm --filter @kxh4892636/etf run db:generate
```

`sync:market` 遍历证券目录，按上游 `count=-10000` 拉取全量、裁剪到上海昨日，事务写入日线与交易日历并输出覆盖摘要；首次预填或缓存范围偏短时执行。当前两个证券的全量约为 3108 / 5048 根，详见 [行情全量同步工作流](../../docs/etf/workflows/0001-行情全量同步/0001-行情全量同步.md)。

修改存储 schema 后执行 `db:generate`，将 SQL、journal 与 snapshot 一并保留。E2E 使用独立端口 15173/18181、临时 SQLite 与受控上游，结束回收自有进程；可通过 `ETF_E2E_FRONTEND_PORT`、`ETF_E2E_BACKEND_PORT` 改端口。日线仅支持前复权，历史范围受上游返回窗口限制。
