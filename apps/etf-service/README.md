# ETF Node 行情服务

Node.js >=22.12.0，使用 Hono、Drizzle ORM、Zod 和 SQLite。在仓库根执行 pnpm install，然后启动：

```sh
pnpm --filter @kxh4892636/etf-service run dev
```

服务默认监听 127.0.0.1:8080，浏览器看板可以跨源调用。GET / 为健康检查；GET /api/securities 返回证券目录；GET /api/daily-bars?symbol=932315.CSI 查询前复权日线，另支持 adjType=qfq、startDate、endDate。

在本应用目录创建可选 .env，或使用进程环境变量（优先）：

```dotenv
PORT=8080
DATABASE_DSN=./data/etf-service.sqlite
```

仅允许这两项 .env 配置。数据库路径相对服务工作目录；初次启动执行 SQL migrations 和证券初始化。SQLite 驱动使用随 better-sqlite3 13 分发的原生预编译文件，不需要本机 Python/C++ 编译器。

```sh
pnpm --filter @kxh4892636/etf-service run build
pnpm --filter @kxh4892636/etf-service run start
pnpm --filter @kxh4892636/etf-service run test:coverage
pnpm --filter @kxh4892636/etf-service run db:generate
```

修改存储 schema 后执行 db:generate，将 SQL、journal 和 snapshot 一并提交。生产部署需携带本应用的 dist、migrations 及依赖，工作目录设为应用目录；开发启动与构建产物共用 migrations。

本次创建新缓存，不读取或覆盖 .temp/etf 中的旧 GORM 数据库。上游单次最多返回 1000 根日线，旧库中更早的历史可能无法重建。数据上界为上海时间昨日；沿用原项目对缺失行情推定闭市的缓存规则，不代表权威交易日历。Connect/protobuf 接口已停用。
