---
name: etf
description: etf 领域开发路由。触发：apps/etf-dashboard 或 apps/etf-service 的前后端业务、ConnectRPC 契约、K 线看板、行情缓存、红色火箭数据源、SQLite、ETF 项目结构、测试、E2E、交付验证、联调或生成代码。
---

# etf

这是 `etf-dashboard` 前端和 `etf-service` 后端的领域 skill。处理 ETF 相关任务时，先判断任务落点，再读取对应 reference；跨端改动以后端 proto 契约为源头，按生成链路同步前端客户端。

## Git 信息

- 仓库路径：`D:\projects\kxh-awesome`
- 远端：`origin git@github.com:kxh4892636/kxh-awesome.git`
- 当前主分支：`main`
- 前端应用路径：`apps/etf-dashboard`
- 后端应用路径：`apps/etf-service`
- 两个应用都不是独立 Git 仓库，提交、分支和状态检查在仓库根目录执行。

## 应用索引

| 应用 | 路径 | 类型 | 入口 | 主要职责 |
| --- | --- | --- | --- | --- |
| etf-dashboard | `apps/etf-dashboard` | React 前端 | `src/main.tsx`, `src/app.tsx`, `src/routes/index.tsx` | ETF K 线看板、标的选择、行情图表、Connect Query 请求 |
| etf-service | `apps/etf-service` | Go ConnectRPC 后端 | `main.go`, `internal/app/server.go`, `proto/etf/v1/etf.proto` | 证券列表、日线 K 线查询、本地缓存刷新、SQLite 存储、API 文档 |

## 总依赖关系

- `etf-dashboard` 运行时依赖 `etf-service` 的 ConnectRPC HTTP 接口；默认后端地址是 `http://localhost:8080`，可由 `VITE_API_BASE_URL` 覆盖。
- `etf-dashboard` 编译时依赖 `etf-service` 的 proto 契约；`connectrpc.config.json` 指向 `../etf-service`，`vp run gen` 生成 `src/api/gen/etf-service/**`。
- `etf-service` 的 API 契约源头是 `proto/etf/v1/etf.proto`；`./generate.sh` 生成 Go ConnectRPC 代码和 `docs/index.html`。
- `etf-service` 运行时依赖本地 SQLite 数据库和红色火箭行情源；SQLite 默认路径是 `apps/etf-service/data/etf-service.sqlite`。
- 契约依赖方向是后端 proto -> 后端生成代码/文档 -> 前端生成客户端 -> 前端 hooks/页面；不要反向手改生成物。

## 领域路由

### 测试与验收

- 编写或更新 ETF Markdown/Gherkin 验收资产时，调用 `/e2e` 的“写验收资产”分支；ETF 的需求流程、回归流程与晋升门槛读取 `references/test.md`。
- 通过浏览器、API 或 CLI 执行 ETF 真实系统路径并留证时，调用 `/e2e` 的“跑真实路径”分支；项目入口、运行命令与场景范围读取 `references/verification.md`。
- 对 ETF 改动执行本地门禁、运行态确认、E2E、接口排障或最小重验时，调用 `/verifying`；项目级门禁映射读取 `references/verification.md`。
- 改 ETF 前端验收资产目录、需求流程或回归流程的晋升规则时，读取 `references/test.md`。

### 前端

- 改页面、路由、Provider、看板组件、图表、状态和格式化时，读取 `references/frontend/application.md`。
- 改前端开发命令、生成物、项目结构时，读取 `references/frontend/development.md`。
- 改前端 RPC 调用、Connect Query hook、后端地址或生成客户端时，读取 `references/frontend/api.md`。
- 处理前后端开发链路、契约同步或跨端改动顺序时，读取 `references/development-flow.md`。

### 后端

- 改服务装配、模块边界、配置、数据源、SQLite 或行情缓存逻辑时，读取 `references/backend/application.md`。
- 改后端开发命令、代码生成、生成物或项目结构时，读取 `references/backend/development.md`。
- 改 proto、ConnectRPC handler、对外接口、错误码或前后端契约同步时，读取 `references/backend/api.md`。
- 处理前后端开发链路、契约同步或跨端改动顺序时，读取 `references/development-flow.md`。

## 开发链路

前后端开发链路统一维护在 `references/development-flow.md`。

## 边界

- `apps/etf-dashboard/src/api/gen/**`、`apps/etf-service/gen/**`、`apps/etf-service/docs/index.html` 是生成物，不手写。
- `apps/etf-service/data/**` 是运行数据，不把手工改 SQLite 文件作为常规开发路径。
- ETF 业务代码仍遵循仓库级 `kxh-awesome` 工具链规则；前端 Node/workspace 操作用 `vp`。
