# Backend Development

## 项目结构

- `apps/etf-service/go.mod`：Go module，模块名是 `kxh-awesome/etf-service`。
- `apps/etf-service/proto/`：Protocol Buffers 契约，先改 proto，再生成代码。
- `apps/etf-service/internal/app/`：HTTP server 生命周期、依赖装配、路由注册、CORS、h2c、健康检查和文档静态服务。
- `apps/etf-service/internal/modules/market/`：行情模块。
- `apps/etf-service/internal/shared/config/`：环境变量和支持证券配置。
- `apps/etf-service/internal/shared/db/`：SQLite/GORM 打开逻辑。
- `apps/etf-service/internal/shared/utils/`：跨模块日期工具。
- `apps/etf-service/internal/integrations/hongsehuojian/`：红色火箭行情源客户端和解析。
- `apps/etf-service/gen/` 和 `apps/etf-service/docs/`：生成物，只读。

## 常用命令

在 `apps/etf-service` 下执行：

- `./generate.sh`：生成 Go 代码和 API 文档。
- `go run .`：启动服务，默认监听 `http://localhost:8080`。
- `go test ./...`：运行 Go 测试和编译检查。

## 生成链路

- `generate.sh` 会确保 `protoc-gen-go`、`protoc-gen-connect-go`、`buf` 和 `protoc-gen-doc` 可用。
- `buf generate` 生成 Go proto 和 ConnectRPC 代码。
- `buf generate --template buf.gen.doc.yaml` 生成 HTML API 文档。
- 不手写 `gen/` 和 `docs/index.html`。

## 运行数据

- 默认 SQLite 文件位于 `apps/etf-service/data/etf-service.sqlite`。
- `data/` 下 SQLite 文件是运行数据，不把手工编辑作为常规开发路径。
- 需要改变初始支持证券时，优先修改 `internal/shared/config/securities.go` 并运行相关测试。
