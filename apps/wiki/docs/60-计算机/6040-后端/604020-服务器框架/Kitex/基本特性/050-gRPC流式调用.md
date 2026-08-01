---
id: 00910b37-6ef7-48b9-b270-ecd4ff624dad
---

# Kitex gRPC 流式调用

## Streaming 类型

- Unary: 流上的 PingPong（有性能损失，不建议）;
- Server Streaming: 一个请求多个响应;
- Client Streaming: 多个请求一个响应;
- Bidirectional Streaming: 收发独立流，可任意顺序;
- IDL 用 `stream` 关键字定义（proto3）;

## 生成与调用

- 生成代码结构与 PingPong 相同，`echo.pb.go` + `echo.pb.fast.go` + service 包;
- Server handler 通过 `stream.Recv()` / `stream.Send()` 处理;
- Client: `cli.ClientSideStreaming(ctx)` 返回 stream，`Send` / `CloseAndRecv`;
- `stream.Recv()` 返回 `io.EOF` 表示对端发送结束;

## 服务治理限制

- 熔断: 仅支持创建 Stream 时的错误率熔断;
- 重试: 不支持; Fallback: 不支持;
- 负载均衡: 仅创建 Stream 时生效，创建后流量固定到该对端;
- 一致性哈希: 中间件中 request 为 nil，hashKey 需提前放入 ctx 再在 keyFunc 中读取;
- 限流: 支持创建 Stream 时限流，Recv/Send 无限制;
- 超时: 无请求超时 Option; Stream 整体超时用 `context.WithTimeout` 创建 ctx（经 `grpc-timeout` 传给 server）; Recv/Send 超时用 `streaming.CallWithTimeout(d, cancel, fn)`;

## 中间件

- Client 中间件仅覆盖创建 Stream 环节，response 为 `*streaming.Result`，request 恒 nil;
- Server 中间件 next 涵盖整个 handler，request 为 `*streaming.Args`，response 恒 nil;
- 通过 response/request 类型识别 streaming 请求;
- 消息级处理需 Recv/Send 中间件（`WithRecvMiddleware` / `WithSendMiddleware`），next 前先调用才能读到消息;
- 各中间件间共享数据用 `contextmap.WithContextMap(ctx)` 注入 sync.Map;

## 优雅退出

- v0.12.0+ 支持 gRPC Streaming 优雅退出;
- `server.WithExitWaitTime(graceTime)`: 生命周期小于窗口的流持续到结束，超窗口的强制关闭; 默认 5s;
