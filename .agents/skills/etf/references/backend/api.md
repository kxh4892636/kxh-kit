# Backend API

## 契约源头

- `apps/etf-service/proto/etf/v1/etf.proto` 是 ETF API 契约唯一源头。
- proto package 是 `etf.v1`。
- Go package option 是 `kxh-awesome/etf-service/gen/etf/v1;etfv1`。

## ConnectRPC 服务

- 服务名：`EtfService`。
- `ListSecurities(ListSecuritiesRequest) returns (ListSecuritiesResponse)`：列出系统支持的证券。
- `GetDailyBars(GetDailyBarsRequest) returns (GetDailyBarsResponse)`：查询日线 K 线数据，必要时刷新本地缓存。

## 核心消息

- `Security`：证券基础信息，包含 `symbol`、`name`、`asset_type`、`exchange`、`currency`、`source`、`earliest_trade_date`、`latest_cached_trade_date`。
- `DailyBar`：单根日线 K 线，包含 OHLC、成交量、成交额、涨跌额、涨跌幅和原始星期字段。
- `GetDailyBarsRequest`：包含 `symbol`、`adj_type`、可选 `start_date` 和 `end_date`。
- `GetDailyBarsMeta`：返回缓存状态、请求范围、生效范围、最早交易日、最新缓存日、是否刷新和行数。

## HTTP 与错误

- `GET /`：健康信息。
- `/doc/`：内嵌 HTML API 文档。
- `ErrUnknownSecurity` 在 controller 中映射为 Connect `CodeNotFound`。
- 其他业务错误映射为 Connect `CodeInternal`。

## 契约变更顺序

前后端契约变更顺序统一维护在 `../development-flow.md`。
