# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-前后端共同迁移为类型化接口](001-%E5%89%8D%E5%90%8E%E7%AB%AF%E5%85%B1%E5%90%8C%E8%BF%81%E7%A7%BB%E4%B8%BA%E7%B1%BB%E5%9E%8B%E5%8C%96%E6%8E%A5%E5%8F%A3.md) | 前后端共同迁移为 Node/Hono/Zod 类型化接口，停用 Connect/protobuf。 | accepted |
| [002-以新缓存切换到Drizzle持久化](002-%E4%BB%A5%E6%96%B0%E7%BC%93%E5%AD%98%E5%88%87%E6%8D%A2%E5%88%B0Drizzle%E6%8C%81%E4%B9%85%E5%8C%96.md) | 用 Drizzle + SQLite 管理新缓存，不迁移旧 GORM 文件。 | accepted |
| [003-保留代码化行情回归](003-%E4%BF%9D%E7%95%99%E4%BB%A3%E7%A0%81%E5%8C%96%E8%A1%8C%E6%83%85%E5%9B%9E%E5%BD%92.md) | 保留代码化行情回归：纯逻辑单测、真实浏览器组件测试和薄 E2E。 | accepted |
| [004-合并为单一应用并按业务域分层](004-%E5%90%88%E5%B9%B6%E4%B8%BA%E5%8D%95%E4%B8%80%E5%BA%94%E7%94%A8%E5%B9%B6%E6%8C%89%E4%B8%9A%E5%8A%A1%E5%9F%9F%E5%88%86%E5%B1%82.md) | 合并为 apps/etf 单一应用，按 client/server/shared 与业务域分层。 | accepted |
| [005-以全量历史同步替代1000根窗口](005-%E4%BB%A5%E5%85%A8%E9%87%8F%E5%8E%86%E5%8F%B2%E5%90%8C%E6%AD%A5%E6%9B%BF%E4%BB%A31000%E6%A0%B9%E7%AA%97%E5%8F%A3.md) | 用全量历史同步（count=-10000）替代 1000 根窗口。 | accepted |
