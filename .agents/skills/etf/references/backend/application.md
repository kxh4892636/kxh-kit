# Backend Application

## 技术栈

- Go 1.23+ ConnectRPC 后端。
- 使用 GORM 和 SQLite。
- ConnectRPC handler 通过 h2c 服务，便于本地 HTTP/2 调试。
- 行情源为红色火箭。

## 入口与装配

- `main.go` 只保留进程入口和内嵌文档。
- `internal/app/server.go` 负责加载配置、打开 SQLite、AutoMigrate、种子证券、装配 repository/service/fetcher/handler、注册 ConnectRPC 路由、健康检查、CORS 和 `/doc/` 静态文档。
- `internal/shared/config/config.go` 读取 `.env`、`PORT` 和 `DATABASE_URL`；默认端口是 `8080`，默认数据库是 `./data/etf-service.sqlite`。
- `GET /` 返回健康信息 JSON。
- `/doc/` 暴露内嵌 HTML API 文档。

## 市场模块

- `internal/modules/market/controller.go`：ConnectRPC controller，负责 proto 和领域类型转换、错误码映射。
- `internal/modules/market/service.go`：行情业务用例，负责缓存刷新、日期裁剪、休市标记和查询编排。
- `internal/modules/market/repository.go`：GORM repository。
- `internal/modules/market/model.go`：GORM model。
- `internal/modules/market/types.go`：领域类型。
- `internal/modules/market/errors.go`：领域错误。

## 缓存与日期口径

- `GetDailyBars` 默认 `adjType` 为 `qfq`。
- 本地缓存只认 T-1，避免交易日盘中未定稿数据污染图表口径。
- 请求范围会裁剪到证券最早交易日和已完成交易日。
- 刷新判断基于最近应开市日，避免周末和节假日误判缓存落后。
- 刷新后把无 K 线的工作日写入日历为休市，后续请求跳过已验证缺口。

## 外部集成

- `internal/integrations/hongsehuojian/client.go`：行情源客户端。
- `internal/integrations/hongsehuojian/parser.go`：K 线 JSON 解析。
- 相关解析测试在 `parser_test.go`。
