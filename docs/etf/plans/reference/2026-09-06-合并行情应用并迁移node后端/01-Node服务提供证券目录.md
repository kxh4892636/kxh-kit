---
status: completed
blocked_by: []
---

# Node服务提供证券目录

## 交付

通过 workspace 启动 Node 服务，可查询两个预置证券及健康状态，无需 Go。

## 范围

建立 apps/etf-service、TypeScript 构建与类型导出入口，接入 workspace/catalog；实现配置加载、Hono HTTP 装配与稳定错误体、Drizzle migrations 和证券 seed/store/query。为后续日线扩展提供存储与路由装配，不预建尚未使用的抽象。此项不迁入前端或实现日线刷新。

## 直接依赖

- 无；本图的根任务。

## 验收

- [x] 从新临时数据目录启动后 GET / 返回健康状态，GET /api/securities 按 symbol 顺序返回两个正确的证券及空最新缓存日期。
- [x] SQLite migration 与 seed 重复执行不产生重复证券，重启后目录仍可查询，关闭后可清理临时数据库。
- [x] 缺少可选 .env 可使用默认值；环境变量优先，非法端口和错误配置明确拒绝启动。
- [x] 后端类型检查、测试、构建通过；产物可由 Node 启动，记录实际版本、驱动与启动命令。

## 上下文

- [执行规格](spec.md)
- [领域语言](../../../CONTEXT.md)
- [接口决策](../../../adr/0001-前后端共同迁移为类型化接口.md)
- [缓存决策](../../../adr/0002-以新缓存切换到Drizzle持久化.md)
- [回归决策](../../../adr/0003-保留代码化行情回归.md)

## 下一步

/code-delivery；先完成 Plan 级 /dev-gate，按直接依赖顺序领取。

## 交付记录

交付物：apps/etf-service，包含真实 SQLite 迁移快照、证券 API、配置和 Node 启停。验证证据（提交 1adf5aa）：build、19 项测试、test:coverage 均通过；覆盖率 statements 89.24%、branches 84.21%、functions 85%、lines 90.69%。vp check、check-domain 和 diff check 通过；db:generate 无 schema 变化。真实子进程端口占用返回 EADDRINUSE 和退出码 1。Standards 与 Spec 独立审查通过，初次发现的迁移 snapshot、启动错误和重复错误映射已修复。实际提交由 Flow receipt 记录。
