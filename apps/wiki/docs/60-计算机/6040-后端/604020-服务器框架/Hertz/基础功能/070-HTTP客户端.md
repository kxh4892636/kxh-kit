---
id: 0262ac0b-881c-47a4-aaae-1323e1d1e96f
---

# Hertz HTTP 客户端

## 发送请求

- `c.Do(ctx, req, resp)`: 执行请求，不跟随重定向; req 需含完整 URL 或 Host+RequestURI;
- `c.DoRedirects(ctx, req, resp, max)`: 跟随最多 max 次重定向;
- `c.Get/Post`: 便捷方法，自动跟随重定向，返回 status、body、err;
- 性能关键场景建议用 `protocol.AcquireRequest()` / `AcquireResponse()` 获取复用对象;
- 请求体形式: `SetQueryString`、`SetFormData`、`SetMultipartFormData`、`SetBody`(JSON)、`SetFile`;

## 超时

- `WithRequestTimeout`: Do/DoRedirects/Get/Post 通用请求超时;
- `DoTimeout(ctx, req, resp, d)` / `DoDeadline(ctx, req, resp, t)`: 传参方式设置超时;
- 两种方式都写入 `requestTimeout` 字段，同时使用时以最后一次设置为准;

## Client 配置

- `WithDialTimeout`(1s)、`WithMaxConnsPerHost`(0=不限)、`WithMaxIdleConnDuration`(10s);
- `WithKeepAlive`(true)、`WithClientReadTimeout`(0=不限)、`WithWriteTimeout`(0=不限);
- `WithResponseBodyStream(false)`: 流式读响应;
- `WithTLSConfig`: TLS 配置; `WithDialer`: 自定义拨号器;
- `WithRetryConfig`: 重试配置; `WithName`: 客户端名称（User-Agent）;
- 请求级配置优先于 Client 配置: `WithDialTimeout/WithReadTimeout/WithWriteTimeout/WithRequestTimeout/WithSD/WithTag`;

## 流式读响应

- 开启 `WithResponseBodyStream(true)` 后连接交由用户管理;
- 不回收连接最终会被 GC 关闭，但高并发下可能打满 fd;
- 显式 `protocol.ReleaseResponse()`、`resp.Reset()`、`resp.ResetBody()` 可回收连接复用;
- 回收只能执行一次;

## 其他能力

- `SetProxy(p)`: 设置正向代理，同一客户端只能设置一个;
- `CloseIdleConnections()`: 关闭空闲 keep-alive 连接，不中断在用连接;
- `GetDialerName()`: 获取拨号器名称;
- 客户端中间件: `Use` / `UseAsLast` / `TakeOutLastMiddleware`;
- TLS 场景 netpoll 不支持，需 `client.WithDialer(standard.NewDialer())`;
- 服务发现: `cli.Use(sd.Discovery(resolver))`，请求时传 `config.WithSD(true)`;
