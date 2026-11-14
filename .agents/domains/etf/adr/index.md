# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-前后端共同迁移为类型化接口](001-前后端共同迁移为类型化接口.md) | 前后端共同迁移为 Node/Hono/Zod 类型化接口，停用 Connect/protobuf。 | accepted |
| [002-以新缓存切换到Drizzle持久化](002-以新缓存切换到Drizzle持久化.md) | 用 Drizzle + SQLite 管理新缓存，不迁移旧 GORM 文件。 | accepted |
| [003-保留代码化行情回归](003-保留代码化行情回归.md) | 保留代码化行情回归：纯逻辑单测、真实浏览器组件测试和薄 E2E。 | accepted |
| [004-合并为单一应用并按业务域分层](004-合并为单一应用并按业务域分层.md) | 合并为 repos/etf 单一应用，按 client/server/shared 与业务域分层。 | accepted |
| [005-以全量历史同步替代1000根窗口](005-以全量历史同步替代1000根窗口.md) | 用全量历史同步（count=-10000）替代 1000 根窗口。 | accepted |
