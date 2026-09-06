---
status: in_progress
---

# 合并行情应用并迁移 Node 后端

## 问题

将主工作区的 .temp/etf 合入 kxh-kit，使维护者可以在同一个 workspace 中启动、测试和构建前后端，运行后端无需 Go；用户继续使用证券行情、图表与虚拟均线。用户已确认 manual 模式、设计草案全部选择与本任务图。

## 方案

归属 etf 域。迁入 apps/etf-dashboard，重建 apps/etf-service 为 TypeScript + Node.js + Hono + Drizzle ORM + Zod。前端保留 React 界面，改用 Hono 类型化客户端与 TanStack Query；存储继续 SQLite，使用独立新缓存。

按 01 → 02 → 03 顺序交付：证券目录 API、日线行情 API、完整看板。每项交付对应实现、测试、验证、审查与实际提交，不将代码存在视为验收通过。

## 已排除的备选

- 保留 Go 或 Connect/protobuf：用户选择 Node，已确认前后端共同迁移并停用旧协议。
- 迁移旧 GORM 数据库：已确认使用新缓存，源数据库原样保留，旧历史不保证能重新拉取。
- 同时更换数据库、扩充证券或重做图表：超出功能等价迁移范围。
- 前后端独立维护响应 schema 或预建多数据库框架：增加重复契约与无实际需求的抽象。

## 实施决策

- 两个应用接入现有 pnpm/Vite Plus workspace、catalog 和根锁文件；保留根命令现有用途，ETF 使用独立入口。不导入源 .git、.agents、锁文件或旧 Go 工具链。
- GET / 为健康检查，GET /api/securities 返回证券列表，GET /api/daily-bars 查询日线；后端包导出 AppType 类型入口，前端仅类型依赖，不加载后端启动或存储模块。
- HTTP JSON 使用 camelCase 字段，保留 security、bars、meta 的业务含义及可选日期。请求 symbol 必填且去空格，adjType 缺省为 qfq，startDate/endDate 为严格有效日期且起点不晚于终点。
- 无效输入、未知证券、上游故障、内部故障分别有稳定错误与 HTTP 状态；取消应传播并与上游超时区分，客户端处理失败状态。具体错误体由 01 建立，02/03 复用。
- Zod 在服务端验证请求、环境配置与上游 JSON；行情模块只暴露列证券与查询日线用例，注入 store、fetcher、clock。Hono 只负责装配与 HTTP 语义。
- 保留两项证券：932315.CSI 中证红利质量（最早 2013-12-31）、930955.CSI 红利低波100（最早 2005-12-30）；均为指数，以源定义为核对依据。
- Drizzle SQL migrations 建立 securities、daily_bars、trading_calendar 等必要表；存储实现拥有事务、幂等 seed、批量 upsert、范围排序与最新缓存日期查询。
- 新数据库位于 etf-service 私有数据目录并忽略版本控制；保留 PORT（默认 8080）与 DATABASE_DSN 配置意图。不得默认连接或修改 .temp/etf 中的数据。
- 日线上界为上海时间昨日；裁剪到证券最早日期后为空的区间返回 invalid 空结果且不访问上游。覆盖缓存返回 cache，需要时刷新并返回 refreshed，过滤未完成日期。
- 保留周末及已记录闭市日规则和刷新后的闭市标记。红色火箭 adapter 保留 day、count=-1000、adjust=1 协议、上海日期、15 秒超时、8 MiB 响应限制与取消传播。
- 现有缺失数据推断闭市与上游历史窗口均有局限；不声称权威交易日历或完整历史补全。
- 自动回归使用受控上游、独立测试端口与临时 SQLite；真实上游联通单独记录。复用源单测、组件测试与五组 E2E 的业务断言，替换 Connect mock 与 Go 进程编排。
- 文档权威迁至 docs/etf；旧 GORM、Connect 技术选择由当前 ADR 明确替代，源码职责分离和代码化回归原则保留。

## 工作环境

- 主仓：C:/Users/kxh/kxh-awesome/projects/kxh-kit；源：其 .temp/etf，源提交 3a7fcd6b9411e283c24e13bc7a92a1a85b6e5523。
- 工作树：主仓 .worktrees/etf-node；分支 feat/etf-node，基准 bd75302ce3cf6712c5cdb066b9808429e07a18f9。
- 已实测 Node.js v24.19.0、pnpm 11.22.0，Windows/PowerShell。项目要求 Node >=22.12.0。
- Flow 在本工作树使用 schema 8；主仓旧版状态不修改。恢复使用本目录 Plan 标识和 session 36d56b43-1755-4cfe-bf75-1bf67d03b994。
- 准入实测使用 better-sqlite3 13.0.3、Drizzle ORM 0.45.2、Drizzle Kit 0.31.10、Hono 4.13.7、@hono/node-server 2.1.1、@hono/zod-validator 0.9.1、Zod 4.5.4。官方 Drizzle 当前文档默认展示 RC，用 npm 稳定标签核定上述 ORM/Kit 版本，不照搬 RC 依赖。
- Chrome 存在于 C:/Program Files/Google/Chrome/Application/chrome.exe；真实浏览器测试会在交付时验证启动与运行。
- 独立探针 .flow/probe/probe.mjs 已通过：真实 SQLite migration 重复执行、事务回滚、关闭重开后的持久化、临时库清理，以及 Hono + Zod 合法/非法请求。探针不能替代生产实现测试。
- 探针依赖安装已完成：默认镜像安装停滞后结束自有安装进程，以 npm 官方 registry 重试成功；不修改全局 registry。安装后的探针再次通过。实际应用安装继续使用 pnpm，并按需对单次命令选择可用 registry。

### 执行基线（已确认）

- 比较点固定为本节的 worktree 基准与源提交。顺序 01 → 02 → 03，每项完成实现、测试、验收、Standards/Spec 审查后本地提交，并登记实际提交；确认本基线后连续交付，无需逐项再次确认。
- 最终将已验证分支本地合入 main，先确认主仓无未提交冲突；主仓有其他新提交时正常整合并重验受影响项，不重写历史，不覆盖用户改动。用户已授权合入 main 后 push 到 origin/main；发布不包含在本次执行契约。
- 可安装 workspace 依赖，允许 better-sqlite3 的必要构建脚本，使用本机 Chrome；不改变系统 Node 版本，不改源目录数据。产品依赖以 pnpm catalog/锁文件固定，探针 npm 文件不进入交付。
- 实质需求/基线漂移或外部条件阻止必要门禁时停下并登记事实；普通实现、安装、类型与测试失败先自行定位修复。最终停止点是应用合入 main 并推送 origin/main，且证据与文档齐全。

### 质量门禁

| 门禁           | 来源与入口                                                          | 通过条件                                                                                           |
| -------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 领域与变更检查 | check-domain.mjs .；git diff --check；pnpm exec vp check            | 领域、格式、lint、类型检查通过；全仓既有失败须以基准复现单独列明，不混为 ETF 已通过                |
| 应用构建       | pnpm --filter @kxh4892636/etf-service run build；dashboard 同名命令 | 两个应用类型检查与构建成功，Node 可启动后端                                                        |
| 服务与前端回归 | 两个应用的 test 命令；test:coverage 使用 Vitest V8                  | 完整应用测试通过，成功/失败/日期/取消/存储等验收均有断言                                           |
| 覆盖率         | code-test/SKILL.md；两个应用分别运行 test:coverage                  | 全部手写生产代码 statements、branches、functions、lines 各至少 80%；不能通过排除入口或缩小范围达标 |
| 消费者旅程     | dashboard test:e2e，Playwright + Chrome                             | 五组 E2E 均运行通过，受管 Node 停服恢复不跳过，临时数据与进程可清理                                |
| Workspace 集成 | 根 pnpm run ready                                                   | 记录 check、递归 test/build 的结果；新增失败修复，基准已有失败以复现证据和影响范围说明             |
| 上游与审查     | 真实红色火箭冒烟；code-review                                       | 单独记录真实上游结果，不以 mock 代替联通；双轴审查无阻塞项                                         |

覆盖率工具与命令在实现时接入应用脚本。以上 public interfaces 为 HTTP API、行情用例、Drizzle store、上游 adapter 和前端可见交互；用外部可观察行为验证，不测私有函数实现形态。

## 范围

01 唯一拥有服务包、配置、HTTP 错误契约、证券存储与查询。02 唯一拥有日线与交易日历存储、行情策略和上游适配。03 唯一拥有前端迁入、类型化客户端、浏览器回归和完整产品启动文档。各 Issue 同时拥有本项测试、构建与验证，不另设无业务结果的测试阶段。

最终在 kxh-kit 中交付功能等价的前后端；本地合并方式见执行基线，远端推送已获授权，发布不在范围内。

## 非范围

旧 RPC 客户端兼容、旧缓存迁移、新证券或复权能力、权威交易日历、账户与交易功能。保留 .temp/etf 作为源参考。

## 待定

- 2026-09-06 用户回复「go」确认 01 → 02 → 03 任务边界与依赖图，进入 /dev-gate 建立执行与质量基线。
- 驱动版本与临时库探针已取证通过；2026-09-06 用户确认执行基线并授权合入后 push，无待确认项。若必须改变 Node 最低版本或数据库选择，重新确认受影响基线。
- 产品测试与构建已执行，结果及全仓基准失败见 [验证记录](03-行情看板迁入与完整回归.md#验证记录)。

## 上下文

- [领域语言](../../../CONTEXT.md)
- [接口决策](../../../adr/0001-前后端共同迁移为类型化接口.md)
- [缓存决策](../../../adr/0002-以新缓存切换到Drizzle持久化.md)
- [回归决策](../../../adr/0003-保留代码化行情回归.md)
- 设计确认记录：本工作树 .flow/quest/2026-09-06-合并行情应用并迁移Node后端.md。
- 源行为与测试：主仓 .temp/etf/apps/service/internal、.temp/etf/apps/dashboard/src、.temp/etf/apps/dashboard/e2e。

## Issue

| #   | Issue                                                  | 状态        | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------ | ----------- | ------ | -------------- |
| 01  | [Node服务提供证券目录](01-Node服务提供证券目录.md)     | completed   | —      | /code-delivery |
| 02  | [日线查询与缓存刷新](02-日线查询与缓存刷新.md)         | completed   | 01     | /code-delivery |
| 03  | [行情看板迁入与完整回归](03-行情看板迁入与完整回归.md) | in_progress | 02     | /code-delivery |
