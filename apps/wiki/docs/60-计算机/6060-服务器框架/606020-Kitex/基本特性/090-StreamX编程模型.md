---
id: fa0aeac0-922c-4d22-8fdc-2e60ee43d8d9
---

# Kitex StreamX 编程模型

## 概述

- StreamX 为流式编程提供全新接口(Kitex Tool v0.13.0+, 生成需 `-streamx` flag);
- 支持 TTHeader Streaming(Thrift)与 gRPC Streaming(Thrift/Protobuf);
- 协议只影响代码生成, 使用方式一致;

```shell
kitex -streamx -module <go module> -service service echo.thrift
```

## 三种流模式

- Client Streaming: `client.Send(req)...` 后 `client.CloseAndRecv(res)`; server `Recv` 到 `io.EOF` 后 `SendAndClose`;
- Server Streaming: 一个请求多个响应; client `Recv` 到 `io.EOF` 结束;
- Bidirectional: 收发独立; client 必须 `CloseSend()`, server Recv 到 EOF 结束;
- 流接口: Client 用 `stream.Send(ctx, req)` / `Recv(ctx)` / `CloseSend(ctx)`; Server 用 `stream.Recv(ctx)` / `Send(ctx, resp)`;

## 初始化

```go
cli, err := testservice.NewClient("a.b.c",
	client.WithStreamOptions(client.WithStreamRecvMiddleware(...), client.WithStreamSendMiddleware(...)))

svr := testservice.NewServer(new(serviceImpl),
	server.WithStreamOptions(server.WithStreamRecvMiddleware(...), server.WithStreamSendMiddleware(...)))
```

## 元信息

- 只在创建 Stream 时透传元信息, 发送消息无法透传;
- 正向: `metainfo.WithValue/WithPersistentValue` 写入 ctx 后创建 stream;
- gRPC streaming 的 key 需大写 + 下划线, TTHeader streaming 无此要求;
- 反向: `stream.SetTrailer(...)`, `stream.SendHeader(...)`; client 用 `stream.Header()` / `stream.Trailer()` 阻塞接收;
- Header/Trailer 可独立于数据帧发送;

## FAQ 要点

- Client 忘记 CloseSend: 框架在 GC 检测不再持有 stream 时自动调用, 但延迟监控会显著变大;
- 长期持有 stream 不 CloseSend 会造成流与 goroutine 泄漏;
- Server Recv 卡死: 给 `Recv(ctx)` 传带超时的 ctx;
- Server handler 不退出则流永不结束;
