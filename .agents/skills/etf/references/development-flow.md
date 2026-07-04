# Development Flow

只改前端展示或交互时，先读取前端 application/development/api reference，修改 `apps/etf-dashboard/src/**`，再按 `verification.md` 的前端分组选择最小验收。

只改后端业务时，先读取后端 application/development/api reference，修改 `apps/etf-service/internal/**`、`main.go` 或配置，再按 `verification.md` 的后端分组选择最小验收。

改接口契约时，顺序固定为：

1. 修改 `apps/etf-service/proto/etf/v1/etf.proto`。
2. 在 `apps/etf-service` 运行 `./generate.sh`，更新 Go ConnectRPC 代码和 API 文档。
3. 调整 `apps/etf-service/internal/modules/market/controller.go` 的 proto 映射。
4. 按需要调整 `service.go`、`types.go`、repository、model 或配置。
5. 在 `apps/etf-service` 运行 `go test ./...`。
6. 在 `apps/etf-dashboard` 运行 `vp run gen`，更新 `src/api/gen/etf-service/**`。
7. 调整 `apps/etf-dashboard/src/hooks/use-market.ts` 和页面调用方。
8. 在 `apps/etf-dashboard` 运行 `vp run build`。

改跨端用户路径但不改 proto 时，先定位数据来源和消费点，再按后端实现、前端 hook、页面表现的顺序做最小闭环；最后按 `verification.md` 做本地联调。

不要手写 `apps/etf-service/gen/**`、`apps/etf-service/docs/index.html` 或 `apps/etf-dashboard/src/api/gen/**`。
