---
id: 4f37fafb-7698-4ad3-bba1-da1b7ec02d67
---

# OpenTelemetry 与 Prometheus

三类信号包含什么？OpenTelemetry是什么？Prometheus 指标是什么？Hertz 接入应该如何完成？告警起点是什么？

## 三类信号

- Trace: 一次请求跨 Hertz、Kitex、数据库和外部 HTTP 的因果路径;
- Metrics: 请求量、错误率、延迟和饱和度的聚合趋势;
- Log: 某个事件的上下文和错误细节;
- 关联: 日志带 trace_id，告警从指标跳转到 Trace，再定位日志;

## OpenTelemetry

- server span: 记录 route、method、status 和错误状态;
- context propagation: 提取入站 trace context，并传给 Service 和下游 Client;
- child span: 数据库、Kitex 或 HTTP Client 使用对应 instrumentation;
- sampling: 入口统一决策; 错误与高延迟可使用后端 tail sampling;
- exporter: 初始化失败策略和关闭时 flush 必须明确;

## Prometheus 指标

```text
http_server_requests_total{method,route,status_class}
http_server_request_duration_seconds{method,route}
http_server_active_requests{method,route}
```

- Counter: 累计请求、错误和重试;
- Histogram: 延迟和响应体大小分布;
- Gauge: 当前连接、在途请求和队列长度;
- label: 只使用有限集合; 禁止 user_id、原始 path、request_id;

## Hertz 接入

- OpenTelemetry: 使用 Hertz 的 tracing/instrumentation 接口或对应贡献扩展;
- Prometheus: 通过监控扩展采集 server 指标，并暴露受保护的 metrics 端点;
- hooks: 在连接、读写或业务阶段需要细粒度数据时启用; 先评估开销;
- 自定义指标: 围绕业务结果命名，不复制 HTTP 通用指标;

## 告警起点

- 可用性: 5xx 比例与成功请求量;
- 延迟: 按路由聚合 p95/p99，不用平均值掩盖长尾;
- 饱和度: 活跃请求、连接池、goroutine 和数据库等待;
- SLO: 以用户可见成功和延迟定义，避免只监控进程存活;
