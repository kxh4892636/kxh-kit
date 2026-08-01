---
id: a615ceed-2a0c-4966-8a04-bc737e86383a
---

# Kitex Thrift 流式与优雅退出

## Thrift Streaming over gRPC

- Kitex v0.9.0+ 引入，v0.9.1 修复 tracing 问题; thriftgo >= v0.3.6;
- 基于 gRPC/HTTP2 实现，Payload 编码从 Protobuf 换成 Thrift;
- 用 `streaming.mode` 注解声明流类型;

```thrift
service TestService {
	Response Echo (1: Request req) (streaming.mode="bidirectional"),
	Response EchoClient (1: Request req) (streaming.mode="client"),
	Response EchoServer (1: Request req) (streaming.mode="server"),
	// Response EchoUnary (...) (streaming.mode="unary"), // 不推荐
	Response EchoPingPong (1: Request req), // 非流式
}
```

- 取值: `bidirectional` / `client` / `server` / `unary`; 其他值报错;
- Streaming 方法有且只有一个 request 和一个 response;
- 同一 Service 可同时定义 PingPong 与 Streaming 方法，server 自动探测协议;
- 生成: `kitex -module demo -service demo-server api.thrift`;

## StreamClient

- Streaming API 必须创建 StreamClient（`streamclient.Option`）;
- 调用时用 `streamcall.Option`（优先级高于 streamclient.Option）;
- `MustNewStreamClient("demo-server", streamclient.WithHostPorts("127.0.0.1:8888"))`;
- Client 发送结束需 `stream.Close()`（CloseSend 语义）;
- `Recv` 返回 `io.EOF` 或 non-nil error 表示 server 结束;

## 生命周期与事件

- Server handler 结束即写 Trailer 关闭 stream，业务无需主动 Close;
- Recv 返回 non-nil error 时 Kitex 才记录 RPCFinish 事件;
- 提前结束需手动 `streaming.FinishStream(stream, err)` 生成 RPCFinish;
- 细粒度事件: 实现 `rpcinfo.StreamEventReporter` 可感知每次 Recv/Send;
- 业务异常不会让 Client RecvMiddleware 感知 error，用 `rpcinfo.GetRPCInfo(ctx).Invocation().BizStatusErr()` 读取;

## 注意事项

- Send/Recv 操作本地缓冲区: Send 返回 nil 不等于已发送到对端;
- 双向流需协商关闭条件，否则 goroutine 泄漏;
- 与 gRPC 其他语言实现不互通（content-type 为 `application/grpc+thrift`）;
- Server Streaming 提前结束只能用 ctx cancel 关闭链接;

## 优雅退出

- `server.WithExitWaitTime(graceTime)`: 让窗口内流持续完成，超窗口强制关闭; 默认 5s;
