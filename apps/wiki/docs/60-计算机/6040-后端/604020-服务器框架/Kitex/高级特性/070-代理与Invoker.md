---
id: 6bffd4da-4b91-46bf-971d-6b572798d187
---

# Kitex 代理与 Invoker

## Invoker（Server SDK 化）

- 将 Kitex server 当作本地 SDK 调用，不走网络;
- `echo.NewInvoker(handler)` 创建 invoker;
- `invoke.NewMessage(local, remote)`: local/remote 为 net.Addr，用于日志监控;
- `msg.SetRequestBytes(buf)` 装载请求二进制，`ivk.Call(msg)` 调用，`msg.GetResponseBytes()` 取响应;

## gRPC Proxy（已废弃文档）

- `server.WithGRPCUnknownServiceHandler(handler)`: 处理未注册的 gRPC 方法调用;
- 两种实现: gRPC Frame 直接转发（免编解码）与解码结构体后转发（可检查/修改字段）;
- Frame 转发用 `nphttp2.GRPCConn` 的 `ReadFrame` / `WriteFrame`，EOF 时需写 EndStream 空帧;
- 更新指南见 Proxy 应用开发指南;

## Proxy 应用开发（v0.15.1+）

- 基于二进制泛化调用实现流量转发;
- Server: `genericserver.RegisterUnknownServiceOrMethodHandler(svr, &UnknownServiceOrMethodHandler{DefaultHandler, StreamingHandler})`;
- 只收 pingpong 流量只需 DefaultHandler; 涉及 grpc/ttstream 需 StreamingHandler;
- grpc 访问非流式方法也会路由到 StreamingHandler（unknown 场景无法获取 IDL Info，默认视作双向流）;
- Client: `genericclient.NewClient(service, generic.BinaryThriftGenericV2(idlServiceName), ...)`;
- 流式协议: 默认 TTHeaderStreaming; 流式方法走 gRPC 加 `client.WithTransportProtocol(transport.GRPCStreaming)` 不影响非流式;
- 建议按协议分集群代理（ttstream 集群 / gRPC 集群）;
