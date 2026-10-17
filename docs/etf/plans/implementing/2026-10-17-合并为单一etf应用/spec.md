---
status: completed
---

# 合并为单一 ETF 应用

## 问题

`apps/etf-dashboard` 与 `apps/etf-service` 分别维护依赖、脚本、类型配置与运行入口，跨端共用的类型只能靠 workspace 包 `exports` 传递。用户要求合并为单一 `apps/etf` 应用：前端技术栈不变（React + Vite + antd + Tailwind），代码与目录可调整；后端继续使用 TypeScript + Hono，以 RPC 形式暴露 API，并采用 Hono 面向大型应用的 RPC 组织与类型优化；后端目录按业务域组织，业务域内分 handler（控制层）、service（业务逻辑层）、repository（数据库接口与实现）三层；service 与 repository 不依赖后端服务框架，只有 handler 依赖 Hono；数据库访问接口与 SQLite 实现解耦，SQLite 只是可替换实现；结构不使用 `src` 层；工具函数归入 `libs`（第三方服务/数据库/API 接入）与 `utils`（项目内部纯逻辑），双端共用代码放入 `shared`。已知关联故事：US-001、US-002、US-003。

## 方案

保留两个应用的全部业务实现，按应用根直接分为三棵源码树：

- `client`：前端源码。技术栈与用户可见行为不变；`libs/api` 保留 Hono RPC client 与 TanStack Query hooks，原 `common` 的纯工具改放 `utils`，`index.html` 与 `public` 也归属 `client`。
- `server`：后端源码，按业务域 `market` 组织，域内分三层：
  - `market/handler`：控制层。Hono 路由、Zod 请求校验、错误到 HTTP 的映射；只依赖 service 与框架，不访问数据库、不写业务规则。
  - `market/service`：业务逻辑层。证券列表与日线查询用例、日期裁剪/缓存策略、取消传播；依赖 repository 接口与 `RemoteFetcher`，不导入 Hono、Drizzle、SQLite 或 `AppType`。
  - `market/repository`：数据库层。`market-repository.ts` 定义数据库接口 `MarketRepository` 与存储类型，`sqlite/` 提供 SQLite 实现（Drizzle schema、查询、事务、幂等 seed）；接口与实现都不导入 Hono。
  - `MarketError` 归属 service，只携带业务错误码（`not_found`、`deadline_exceeded`、`upstream_unavailable`）与消息，不携带 HTTP 状态；HTTP 状态映射由 `market/handler/errors.ts` 完成。
  - 跨域基础设施：`libs/sqlite/database.ts` 负责 SQLite 连接与迁移，`libs/hongsehuojian/` 负责上游行情 API client 与解析；`utils/dates.ts` 放纯逻辑日期 schema 与上海日期。
  - `server/app.ts`：控制层装配，按 Hono 大型应用建议把 HTTP 中间件与 `/api` 子路由**链式**组合为 `routes`，用 `.onError()` 与 `.notFound()` 统一错误/404，并导出经 `ApplyGlobalResponse` 扩展全局错误类型的 `AppType`；`server/server.ts` 是唯一组合根，按「选择数据库实现 → repository → service → app」显式注入依赖；`main.ts` 只负责进程入口与信号处理。
- `shared`：双端共用的契约类型 `Security`、`DailyBar`、`DailyBarsMeta`、`DailyBarsResponse`，统一响应 `ApiResponse<T>`、业务码 `ApiCode` 与 `apiOk`/`apiFail`（`shared/api.ts`），以及交易日期解析/格式化/校验/加减/工作日纯函数（`shared/utils/trade-date.ts`）。
- 单一 `package.json` 合并依赖与脚本；前端通过 `AppType` 类型导入并复用 `shared` 契约类型，删除 `@kxh4892636/etf-service` workspace 包。
- 统一响应：成功与失败都返回 `ApiResponse<T> = { code: number; message: string; extra: Record<string, any>; data: T }`；`code` 是业务码（0 成功，1001–1006 错误），`data` 是响应数据（失败为 null），`message` 是安全描述，`extra` 是结构化附加信息（默认 `{}`）；HTTP 状态由 Hono 按语义单独返回，与业务码分离。
- 迁移 `migrations/`、`drizzle.config.ts`、`e2e/` 到应用根；E2E 仍启动自有前端与受管后端。

最终结构：

```text
apps/etf/
├── package.json              # @kxh4892636/etf，合并后的依赖与脚本
├── vite.config.ts            # root: client；@ → client；@shared → shared；outDir ../dist/client
├── vitest.config.ts          # unit(双端纯逻辑+服务端) + browser(组件)
├── playwright.config.ts
├── tsconfig.json             # 统一类型检查（client/server/shared + 配置）
├── tsconfig.server.json      # rootDir "."、outDir dist；产出 dist/server + dist/shared
├── drizzle.config.ts
├── migrations/               # Drizzle SQL 迁移（SQLite 方言）
├── e2e/                      # 五组旅程、受管后端与受控上游
├── client/                   # 前端源码根
│   ├── index.html
│   ├── public/
│   ├── app/                  # 入口、路由、Provider、配置
│   ├── pages/home/index.tsx
│   ├── features/market-dashboard/
│   │   ├── index.tsx  dashboard-toolbar.tsx  market-summary.tsx  ...测试
│   │   └── chart/            # 数据、画布、交互、MA（原路径不变）
│   ├── libs/api/             # 第三方 API 接入：Hono RPC client、query hooks
│   ├── utils/                # 纯逻辑：cn、数值格式化
│   └── test-support/render.tsx
├── server/                   # 后端源码根
│   ├── app.ts                # 控制层装配：链式 routes、CORS、健康检查、onError/notFound、AppType
│   ├── config.ts             # PORT / DATABASE_DSN
│   ├── main.ts               # 进程入口
│   ├── server.ts             # 组合根：选择数据库实现 → repository → service → app → serve/close
│   ├── server.test.ts        # 配置、入口、启动/关闭
│   ├── market/               # 业务域：行情
│   │   ├── handler/          # 控制层（唯一的业务框架依赖点）
│   │   │   ├── routes.ts     # Hono RPC 路由与 Zod 校验
│   │   │   ├── errors.ts     # 业务错误码/Zod/取消 → HTTP 状态
│   │   │   └── routes.test.ts
│   │   ├── service/          # 业务逻辑层（框架无关）
│   │   │   ├── market-service.ts  # 用例、RemoteFetcher、输入类型
│   │   │   ├── errors.ts          # MarketError（业务错误码，无 HTTP 状态）
│   │   │   └── market-service.test.ts
│   │   └── repository/       # 数据库接口与实现（框架无关）
│   │       ├── market-repository.ts  # 数据库接口 MarketRepository、TradingDay
│   │       ├── securities.ts         # 与实现无关的证券种子数据
│   │       └── sqlite/               # SQLite 对接口的实现（可替换为 MySQL/PG）
│   │           ├── sqlite-market-repository.ts
│   │           ├── schema.ts
│   │           └── sqlite-market-repository.test.ts
│   ├── libs/
│   │   ├── sqlite/database.ts     # 第三方数据库接入：连接、WAL、迁移
│   │   └── hongsehuojian/         # 第三方 API 接入：上游 client 与解析
│   └── utils/dates.ts        # Zod 日期 schema、上海日期
└── shared/                   # 双端共享
    ├── api.ts                # ApiResponse<T>、ApiCode、apiOk/apiFail（统一响应契约）
    ├── market.ts             # 契约类型
    └── utils/trade-date.ts   # 纯日期函数（含测试）
```

`client`、`server`、`shared` 各自作为源码根计算 code-spec 的层级（等价于各自 level-1）：`libs`/`utils` 位于 level-2，`features` 位于 level-2，`features/market-dashboard/chart` 位于 level-4 且只含文件，`server/market/{handler,service,repository}` 位于 level-3，`repository/sqlite` 位于 level-4 且只含文件。

构建布局：服务端 `tsconfig.server.json` 以 `rootDir = "."`、`outDir = dist` 编译 `server` 与 `shared`，产出 `dist/server/*`、`dist/shared/*`；Vite 以 `client` 为 root，产出 `dist/client/`。`start` 为 `node dist/server/main.js`。

参考 kitex 分层：入口/装配（`main.ts`/`server.ts`/`app.ts`）→ 业务域 `market` 内的 `handler`（控制层）→ `service`（业务逻辑）→ `repository`（数据库接口与实现）；第三方 client 放 `libs`；契约模型放 `shared`，`AppType` 充当 RPC IDL，不照搬 Go 的 `internal`、`kitex_gen` 目录。service 与 repository 不感知 Hono/HTTP，便于单测和替换实现。

## 已排除的备选

- 把数据库接口放在 `service/ports.ts`：用户明确 repository 同时承载数据库接口与实现；接口归 `market/repository/market-repository.ts`，service 只依赖该接口。
- 让 service 或 repository 依赖 Hono/HTTP 状态：违反「只有 handler 依赖后端服务框架」；错误码与 HTTP 映射分离。
- 按技术层全局拆分 `server/handler`、`server/service`、`server/repository`：用户要求按业务域分层，域内再分三层；全局分层会让一个业务域的改动分散在多处。
- 保留 `market`/`storage`/`integrations` 扁平结构：不满足三层边界与依赖注入。
- 引入 DI 框架（tsyringe、Inversify 等）：单业务模型的依赖图很小，工厂函数 + 组合根显式装配更简单可读。
- handler 直接访问数据库，或 service 内部 `new` repository：破坏三层边界与可测试性，无法替换实现。
- 在 repository 之下再造跨方言 SQL/查询接口：DDL、schema、迁移与查询语法无法被薄接口隐藏，强行抽象会迫使 repository 使用原生 SQL 并丢失 Drizzle 类型；以 `MarketRepository` 作为可替换边界更诚实。
- 用 `node:sqlite` 替换 `better-sqlite3`：当前固定的 drizzle-orm 0.45.2 没有 `node:sqlite` 驱动，Node 22.12 仍需实验开关；要换需升级 Drizzle 并重验迁移工具链，本次不纳入。
- 保留 `src/client`、`src/server`、`src/shared`：用户已明确不需要 `src` 层。
- 把 `libs` 与 `utils` 合并为单一 `common`/`shared`：用户明确要求按「第三方接入 vs 纯逻辑」区分。
- 重写后端：现有实现已是 TypeScript + Hono（ADR 0001/0002），本次只重排边界，重写无业务收益且扩大回归面。
- OpenAPI/SDK 生成或手写 REST 契约：现有 Hono RPC（`AppType` + `hc`）已提供端到端类型，用户也要求保持 RPC 形式。
- 立即引入 TypeScript project references、声明产物缓存或按子应用拆客户端：这些依赖多包/编译产物边界；当前单包只有 2 个接口，先用 `hcWithType` 收口类型实例化，规模增长后再升级。
- `@hono/vite-dev-server` 单进程开发：改变端口、CORS、停服恢复等运行时契约，并引入新插件。
- 由 Hono 托管构建后的前端（单端口生产）：需要新增静态服务、SPA fallback 与对应测试，本次不纳入。
- 拆分 chart 为独立 feature：在 `client` 作为源码根后，`features/market-dashboard/chart/` 正好是 level-4 文件目录，无拆分必要。

## 实施决策

- 应用名为 `apps/etf`，包名 `@kxh4892636/etf`；根 `dev:etf` 改为 `vp run --filter @kxh4892636/etf --no-cache dev`。
- 目录为应用根下的 `client`、`server`、`shared`；前端 `libs/api` 保留 API 接入，`common` → `utils`；后端按业务域 `market` 组织，域内 `handler`/`service`/`repository` 三层。
- 框架边界：`server/market/service` 与 `server/market/repository` 不得导入 `hono`、`@hono/*` 或 `server/app.ts`；Hono 只出现在 `market/handler`、`server/app.ts`、`server/server.ts`、`server/main.ts`。验收时以 import 检查为准。
- 数据库接口：`market/repository/market-repository.ts` 定义 `MarketRepository` 与 `TradingDay`，只依赖 `shared` 类型；`market/repository/sqlite/sqlite-market-repository.ts` 用 Drizzle/SQLite 实现；`market/repository/securities.ts` 提供与实现无关的种子数据。替换 MySQL/PostgreSQL = 新增 `repository/mysql|pg/` 实现同一接口与对应 `libs/...` 连接，在组合根改一处装配。
- 依赖注入：`openSqliteDatabase(dsn)`、`createSqliteMarketRepository(db)`、`createMarketService({ repository, fetcher, now })`、`createMarketHandler(service)`、`createApp(service)` 均为纯工厂；`server.ts` 是唯一组合根，负责「选择数据库实现 → repository → service → app → serve」，不引入 DI 容器。
- 统一响应结构：`shared/api.ts` 定义 `ApiResponse<T> { code: number; message: string; extra: Record<string, any>; data: T }`（`extra` 通过 `type ISafeAny = any` 表达用户指定的任意记录）、业务码表 `apiCode = { ok: 0, invalidArgument: 1001, notFound: 1002, canceled: 1003, internal: 1004, upstreamUnavailable: 1005, deadlineExceeded: 1006, routeNotFound: 1007 }`、`apiOk(data)` 与 `apiFail(code, message, extra = {})`。成功响应的 `data` 为业务载荷（如证券列表、日线响应）；错误响应使用 `ApiResponse<null>`、`data = null`。HTTP 状态与业务码分离，客户端同时检查 `response.ok` 与 `body.code === apiCode.ok` 后解包 `data`。
- 错误分层：`service/errors.ts` 的 `MarketError` 只含域内错误码 `not_found`、`deadline_exceeded`、`upstream_unavailable` 与消息（支持 `cause`）；`handler/errors.ts` 将域内错误码映射为 HTTP 404/504/502 与业务码 `notFound`/`deadlineExceeded`/`upstreamUnavailable` 并用 `apiFail` 包装，ZodError → 400/`invalidArgument`，请求已取消 → 408/`canceled`，未知错误 → 500/`internal`，不泄漏内部细节。
- SQLite 接入库：保持 `better-sqlite3` 13.0.3（驱动）+ `drizzle-orm` 0.45.2（schema/查询）+ `drizzle-kit` 0.31.10（迁移生成）。三者已在 pnpm catalog/锁文件固定并在 Node 24/Windows 实测；同步 API 适合现有同步用例与事务；`better-sqlite3` 13 要求 Node >=22 且提供 Windows/Linux/macOS 预编译；Drizzle 0.45.2 驱动目录无 `node:sqlite`。这些依赖只出现在 `libs/sqlite` 与 `repository/sqlite`。
- 三层职责：handler 只做路由、参数校验、错误映射与调用 service；service 只表达用例、日期裁剪/缓存策略、取消传播与端口调用；repository 只做查询、事务与 seed；第三方连接与上游协议留在 `libs`。
- API 暴露保持 Hono RPC，并采用大型应用组织方式：`server/app.ts` 用单一链式表达式组合 `CORS → 健康检查 → .route("/api", createMarketHandler(service)) → onError → notFound`，由链式 `routes` 推导并导出 `AppType`（`ApplyGlobalResponse<typeof routes, GlobalErrorResponses>`）；子应用内部也不拆断链式定义。前端 `hc<AppType>` 调用，成功响应类型用 `InferResponseType<..., 200>["data"]`，路由路径、请求参数与响应形状不变。
- Hono 大型应用类型优化：全局错误通过 `ApplyGlobalResponse` 合并 `400/404/408/500/502/504` 的 `ApiResponse<null>`，让客户端按状态收窄；未匹配路由由 `notFound` 返回统一结构 `apiFail(apiCode.routeNotFound, "接口不存在", { method, path })` 与 HTTP 404（不用 `c.notFound()`）；使用 `async/await`，避免 handler 返回 `.then()` 链；每个子路由在 `createMarketHandler` 内链式定义，不创建 Ruby-on-Rails 式 `Context` 控制器。单一包只保留一个 Hono 版本、共用 `strict: true` 的 tsconfig，避免版本/项目引用不匹配。
- 引入 `hcWithType`：`client/libs/api/client.ts` 作为唯一 `hc<AppType>` 实例化点，导出 `Client` 与 `hcWithType`（`import type { AppType }` 保证服务端代码不进入浏览器），`createEtfClient` 委托给它；成功响应类型仍按 200 收窄。TypeScript project references、声明产物缓存或按子应用拆客户端仍暂不引入（单包源码下收益有限），当 route 数或 tsserver 延迟明显增长时再升级。
- 错误处理以 `app.onError()` 为主；实测 `app.route()` 子应用的同步 throw 不会进入父级 `onError`，因此保留父级 try/catch 兜底，二者调用同一个 `handleError`，取消/校验/业务错误仍按统一结构返回，未知错误 500 且不泄漏内部细节。
- 共享提取：`Security`、`DailyBar`、`DailyBarsMeta`、`DailyBarsResponse` 移到 `shared/market.ts`，`ApiResponse<T>`/`ApiCode`/`apiOk`/`apiFail` 移到 `shared/api.ts`；日期纯函数从服务端日期模块拆到 `shared/utils/trade-date.ts`，服务端保留 Zod schema 与 `shanghaiDate`。前端 `client/libs/api/client.ts` 复用共享契约类型与业务码，`chart-data.ts` 与 `test-support/render.tsx` 复用 `parseTradeDate`/`formatTradeDate`。
- `market-number-format` 作为纯逻辑移到 `client/utils/`，chart 与看板共同引用；`cn` 移到 `client/utils/cn.ts`。
- Vite `root: "client"`，`index.html` 与 `public/` 随前端迁入 `client/`；构建 `outDir: "../dist/client"`；`@` 别名指向 `client`，`@shared` 指向 `shared`，服务端使用相对导入以保证 `node --experimental-strip-types` 不依赖 tsconfig paths。
- 服务端 `tsconfig.server.json`：`rootDir: "."`、`outDir: "dist"`、NodeNext、`rewriteRelativeImportExtensions`，include `server` 与 `shared`，排除测试；`start` 运行 `node dist/server/main.js`。
- 迁移目录以应用根为工作目录解析（`path.resolve("migrations")`），与 `.env`、相对 `DATABASE_DSN` 的工作目录约定一致；README 明确 dev/start/E2E 均以应用根为 cwd。
- 测试随层放置：`market/handler/routes.test.ts` 覆盖 HTTP 校验与错误映射；`market/service/market-service.test.ts` 用假 repository/fetcher 覆盖用例策略，证明不依赖 SQLite/Hono；`market/repository/sqlite/sqlite-market-repository.test.ts` 覆盖迁移、幂等 seed、事务与查询；`server/server.test.ts` 覆盖配置与进程启停；`libs/hongsehuojian/*.test.ts` 覆盖上游协议；覆盖率 include 三个源码根，排除测试与 `client/test-support`，阈值维持 80%。
- `vitest.config.ts` 两 project 共用 `@`/`@shared` 别名；unit include `client/**/*.test.ts`、`server/**/*.test.ts`、`shared/**/*.test.ts`；browser include `client/**/*.test.tsx`。
- 开发编排：新增 `concurrently`，`dev` 同时运行 `dev:server`（`node --watch --experimental-strip-types server/main.ts`）与 `dev:web`（`vp dev`）。
- SQLite 默认路径改为 `./data/etf.sqlite`；前端错误文案改为「数据加载失败，请确认行情服务已启动」，E2E 常量同步。
- 生产 `start` 只启动 API，不由 Hono 托管 `dist/client`。
- 领域文档新增 ADR 记录「单一应用、按业务域分层、三层边界、框架无关的 service/repository、数据库接口与实现解耦、libs/utils/shared 与 Hono RPC」，更新 CONTEXT 中「ETF 产品」组成，合并 README。

## 工作环境

- 主仓：`C:/Users/kxh/kxh-awesome/projects/kxh-kit`；比较点：main `17d76733`（2026-10-17）。
- 实现位置：主工作区 `C:/Users/kxh/kxh-awesome/projects/kxh-kit`；Plan 文档尚未纳入版本控制，故不建 `.worktrees` 工作树，避免拆分文档与代码状态。
- Node v24（项目要求 >=22.12.0）、pnpm 11.22.0、Windows/PowerShell、本机 Chrome。
- 本机 `apps/etf-service/data` 不存在，无既有 SQLite 缓存需要迁移。
- E2E 使用独立端口 15173/18181 与临时 SQLite；真实上游联通单独记录。

## 范围

- `git mv` 合并两个应用为 `apps/etf`，按 `client/server/shared` 重组，删除旧目录，合并依赖、脚本、tsconfig、Vite/Vitest/Playwright/Drizzle 配置与 `.gitignore`。
- 后端按业务域 `market` 重排为 handler/service/repository 三层并接入依赖注入；repository 同时承载数据库接口与 SQLite 实现，service/repository 去除框架依赖，错误码与 HTTP 映射分离。
- 前端按 `libs`/`utils` 归位工具文件，抽取并复用双端共享契约类型与交易日期纯函数。
- 调整 E2E 后端编排路径与构建命令，保持五组旅程与停服恢复真实执行。
- 更新根 `package.json`、`pnpm-lock.yaml`、README、`docs/etf/CONTEXT.md`、新增 ADR 与 `docs/etf/QUESTIONS.md`。
- 实现后运行类型检查、应用测试、覆盖率、构建、五组 E2E 与 `dev:etf` 冒烟，执行双轴审查并本地提交。

## 非范围

- 行情业务行为、上游协议、HTTP 契约、数据库 schema、前端交互与视觉的改动。
- 响应压缩（`compress`）、`ETag`、HTTP 缓存等运行时中间件优化：本次按 Hono RPC 大型应用文档优化路由组织与类型，不新增运行时缓存/压缩行为。
- 真正接入 MySQL/PostgreSQL：本次只保证接口与实现解耦、SQLite 可替换；不新增第二种数据库实现。
- 由 Hono 托管前端静态资源、单端口生产部署、Vite 代理或单进程开发。
- 迁移、删除或修改旧 GORM 数据与其他应用；不推送远端、不发布。

## 执行约束

- 模式：manual；结构、脚本与运行选择已确认，下一步在 dev gate 等待用户手动确认后实施。
- 停止点：dev gate 确认（已完成）→ 实现、测试、验收；用户随后要求全部改动 commit & push。
- 质量门禁：`vp check`（变更文件）、`pnpm --filter @kxh4892636/etf run test:coverage`、`run build`、`run test:e2e`、根 `pnpm run dev:etf` 冒烟、`check-domain.mjs`（历史失败与本次引入的失败分开记录）、Standards/Spec 双轴审查。
- 既有失败以比较点复现后单独列明，不解释为本次通过。
- 建议跳过 `/to-issues`：单一结构变更且中间状态不可独立运行，用户未提出拆分要求；如无异议按 02 直接交付。

## 待定

- 无。Q3–Q6 已由用户确认按推荐执行；Q7–Q13 由用户直接指定。

## 上下文

- [用户故事](story.md)
- [结构与运行决策](01-结构与运行决策.md)
- [合并目录并回归验证](02-合并目录并回归验证.md)
- [领域语言](../../CONTEXT.md)
- [接口决策](../../adr/0001-前后端共同迁移为类型化接口.md)
- [缓存决策](../../adr/0002-以新缓存切换到Drizzle持久化.md)
- [回归决策](../../adr/0003-保留代码化行情回归.md)
- [上一次合并 Plan](../reference/2026-09-06-合并行情应用并迁移node后端/spec.md)
- 现状：`apps/etf-dashboard/package.json`、`apps/etf-service/package.json`、`apps/etf-service/src/{app,server,main,config}.ts`、`apps/etf-service/src/{market,storage,integrations}`、`apps/etf-dashboard/src/{app,pages,features,libs,common,test-support}`、`apps/etf-dashboard/e2e/support/{backend,fixture-server}`。

## 当前进度

截至 2026-10-17：01、02、03 均 completed。合并结构、统一响应、Hono RPC、E2E 已落地；全量同步 workflow 已补齐两个证券历史（3108 / 5048 根，至 2026-10-16），并新增 workflow 文档与 ADR 0005。已按用户后续指令提交并推送。

## 恢复入口

1. 读取 [story.md](story.md)、本 spec、[01-结构与运行决策](01-结构与运行决策.md) 的「拷问记录」与「交付记录」。
2. 核对工作区：`git status`、`apps/` 目录是否仍为两个应用、`docs/etf/plans/planning/2026-10-17-合并为单一etf应用` 是否存在。
3. 03 完成后，汇总本轮证据并确认是否归档 Plan；已按用户后续指令提交并推送。
4. 若需求或基线漂移，回到 01 重新拷问；否则不要重复确认已达成的决策。

## Notes

| #   | Notes                                          | 状态      | 阻塞于 | 下一步 |
| --- | ---------------------------------------------- | --------- | ------ | ------ |
| 01  | [结构与运行决策](01-结构与运行决策.md)         | completed | —      | —      |
| 02  | [合并目录并回归验证](02-合并目录并回归验证.md) | completed | 01     | —      |
| 03  | [行情全量同步工作流](03-行情全量同步工作流.md) | completed | 02     | —      |
