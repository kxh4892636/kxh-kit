# Backend API

## 契约源头

- `apps/etf-service/proto/etf/v1/etf.proto` 是唯一 API 契约；package 为 `etf.v1`。
- `EtfService.ListSecurities` 返回受支持的 `Security`。
- `EtfService.GetDailyBars` 返回 `Security`、`DailyBar[]` 和缓存 `meta`。
- `GetDailyBarsRequest` 接收 `symbol`、`adj_type`、可选 `start_date` 与 `end_date`。

契约更新顺序见 [../development-flow.md](./../development-flow.md)。

## 请求语义

- `symbol` 必填且必须属于服务支持的证券。
- `adj_type` 为空时归一为 `qfq`；当前只支持 `qfq`。
- 日期必须是 `YYYY-MM-DD`，且 `start_date <= end_date`。
- 合法范围落在证券支持区间或 T-1 之后时返回成功空结果，`cache_status=invalid`，不是参数错误。

## 错误映射

`internal/app/connect_interceptor.go` 是终端错误映射和请求日志入口：

| 领域/系统错误 | Connect code | 日志级别 |
| --- | --- | --- |
| `ErrInvalidArgument` | `InvalidArgument` | warn |
| `ErrUnknownSecurity` | `NotFound` | warn |
| context canceled/deadline | `Canceled`/`DeadlineExceeded` | warn |
| `ErrUpstreamUnavailable` | `Unavailable` | error |
| 数据库或未知错误 | `Internal` | error |

已有 `connect.Error` 原样保留。每个请求只在 interceptor 终端记录一次 `procedure`、`code`、`duration_ms` 和错误摘要；下层只 wrap 上下文，不重复记录，也不记录请求/响应体或秘密。

## HTTP

- `GET /` 返回服务健康 JSON。
- `/doc/` 提供内嵌生成文档。
- ConnectRPC handler 通过 h2c 暴露，并为本地 dashboard 提供 CORS。
