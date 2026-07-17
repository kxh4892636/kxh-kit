# Backend Development

## 项目地图

- `go.mod`：module `kxh-awesome/etf-service`，Go 1.23。
- `proto/etf/v1/etf.proto`：契约源头。
- `internal/app`、`internal/integrations`、`internal/modules`、`internal/shared`：有意义的源码一级边界；不要拆分 `internal` 本身。
- `gen/**` 与 `docs/index.html`：生成物，只读。
- `data/**`：运行数据。

禁止重新引入 `helpers`、`utils` 或无领域含义的目录。`internal/shared` 只收真正跨模块的基础设施。

## 命令

在 `apps/etf-service` 执行：

- `./generate.sh`：从 proto 生成 Go ConnectRPC 代码和 HTML API 文档。
- `go run .`：启动本地服务。
- `go test ./internal/modules/market/...`：市场模块聚焦测试。
- `go test ./internal/integrations/hongsehuojian/...`：行情 adapter 聚焦测试。
- `go test ./internal/shared/config/...`：配置聚焦测试。
- `go test ./...`：全量测试与编译。
- `go vet ./...`：交付静态检查。

Go 文件提交前执行 `gofmt`。契约改动继续按 [../development-flow.md](../development-flow.md) 同步前端。
