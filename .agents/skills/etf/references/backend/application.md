# Backend Application

## 结构

`internal` 是后端源码根，其一级目录具有架构含义，不拆平：

| 一级目录 | 职责 |
| --- | --- |
| `internal/app` | 依赖装配、HTTP 生命周期、Connect interceptor、健康检查、CORS 与文档 |
| `internal/integrations` | 外部系统 adapter；当前为 `hongsehuojian` |
| `internal/modules` | 领域模块；当前为 `market` |
| `internal/shared` | 真正跨模块的配置与数据库基础设施 |

`main.go` 只创建 JSON `slog`、提供嵌入文档并调用 `app.Run`。`shared` 仍保留，但证券目录、交易日历和行情语义归 `market`，红色火箭日期协议归 adapter。

## 市场模块

- `MarketService.GetDailyBars` 是行情用例入口。
- `MarketStore` 是数据库中立的存储 seam；`GormStore` 是当前 adapter，名称不绑定 SQLite。
- `RemoteFetcher` 隔离行情源。
- `securities.go` 持有 `Security` 领域实体和受支持证券目录；ETF/指数是 `asset_type`，不是两套实体。
- `daily_bars_request.go` 持有 qfq 与日期请求语义，`trading_calendar.go` 持有市场日历。
- `connect_handler.go` 只做 proto 与领域类型转换，错误在 app interceptor 统一映射。

缓存以 T-1 为最新完整日；有效请求会裁剪到证券历史区间，已确认无行情的工作日写入交易日历，避免重复刷新缺口。

## 配置与存储

- `internal/shared/config.Config` 只含 `PORT` 和 `DATABASE_DSN`。
- `.env` 缺失允许；存在时只允许空行、注释和上述已知键，未知键、畸形行、空值、读取或设置失败都终止启动。进程环境优先于 `.env`。
- 默认端口 `8080`，默认 DSN `./data/etf-service.sqlite`；非法 `PORT` 不回退。
- `internal/shared/database.OpenSQLite` 是当前 SQLite/GORM 初始化。未来 MySQL/PostgreSQL 在该 seam 增加 dialector，不改变 `MarketStore`。

## 红色火箭

- `kline_client.go` 负责固定 endpoint、`qfq -> adjust=1`、15 秒总超时、非 2xx 和 8 MiB 响应限制。
- `kline_response.go` 的 `ParseKlineJSON` 接受顶层或嵌套 `data` 形态，使用 typed DTO，并校验列、证券、日期、OHLC、非负成交量/额和有限数字。
- 外部错误 wrap 为 `ErrUpstreamUnavailable`，由终端 interceptor 记录一次。
