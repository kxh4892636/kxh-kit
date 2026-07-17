# Development Flow

本文只持有 ETF 跨端变更顺序。应用结构见前后端 application reference，命令与生成物见 development reference，交付门禁见 [verification.md](verification.md)。

## 单端改动

- 只改前端展示或交互：定位 `src/features` 消费点和 `src/libs/api` 数据入口，完成前端实现后执行前端门禁与受影响 E2E。
- 只改后端行为：在 `internal` 的既有一级边界内完成实现，后端行为按 [test.md](test.md) 走 TDD，再执行后端门禁。
- 改消费者可见但不改 proto 的跨端路径：先固定后端语义，再更新 Query hook 和页面，最后联调真实路径。

## 契约改动

顺序固定为：

1. 修改 `apps/etf-service/proto/etf/v1/etf.proto`。
2. 在 `apps/etf-service` 运行 `./generate.sh`，更新 Go 生成代码和 API 文档。
3. 更新 `internal/modules/market/connect_handler.go` 的 proto/领域映射及相关领域行为。
4. 运行后端聚焦测试与 `go test ./...`。
5. 在 `apps/etf-dashboard` 运行 `vp run gen`，更新 `src/libs/api/gen/etf-service/**`。
6. 更新 `src/libs/api/use-market.ts` 及页面消费者。
7. 执行前端门禁和契约影响到的真实浏览器 E2E。

生成文件的变化必须能追溯到 proto 或生成配置，不反向手改生成物。
