---
id: dbe65823-1bb2-4647-9b74-4d8f5f1a9c24
---

# Kitex 多服务与多 Handler

## 单 Server 多 Service

- v0.8.0+ 支持 gRPC 与 Thrift Streaming(HTTP2); v0.9.0+ 支持 Kitex Thrift/Protobuf(non-streaming);
- 每个 Service 独立生成代码, `server.go` 提供 `RegisterService(svr, handler, opts...)`;

```go
svr := server.NewServer(your_server_option)
err := servicea.RegisterService(svr, new(ServiceAImpl))
err = serviceb.RegisterService(svr, new(ServiceBImpl))
err = svr.Run()
```

## 客户端要求

- Kitex >= v0.9.0;
- Thrift / Kitex Protobuf 需 `client.WithTransportProtocol(transport.TTHeader)` + `client.WithMetaHandler(transmeta.ClientTTHeaderHandler)`;

## 备用 Service

- Service 间存在同名方法时, 必须指定一个 Fallback Service(`server.WithFallbackService()`);
- 未指定或指定多个 Fallback Service 时 Server 启动报错;
- 或者使用 `server.WithRefuseTrafficWithoutServiceName`: 不指定 Fallback 也不报错, 但无法识别 Service 名的请求会报错;
- 获取 Service 名/方法名: `kitexutil.GetIDLServiceName(ctx)` / `kitexutil.GetMethod(ctx)`;

## 中间件

- 多 Service 与单 Service 中间件用法一致(`server.WithMiddleware`);
- 通过 service/method 区分处理; 流式与非流式通过 req/resp 类型区分(`*streaming.Args` / `*streaming.Result`);

## 多 Handler 生成

- Kitex Tool v0.11.0+ 支持 `-tpl multiple_services`, 为每个 service 生成独立 handler 文件并统一注册;

```shell
kitex -tpl multiple_services -service your_service path/to/idl
```

- 生成 `handler_A.go` / `handler_B.go` 等, main.go 自动注册;

## 与 Combine Service 对比

- Combine Service(已弃用): 合并所有方法为一个 Service, 方法名必须唯一, 一个 Server 只能注册一个;
- 多 Service: 更推荐, 方法名可相同(需 Fallback 或 WithRefuseTrafficWithoutServiceName);
