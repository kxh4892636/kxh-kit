---
id: 8e9dfdfe-7f81-45d5-803b-83ba32e342b8
---

# Kitex StreamX 中间件与错误处理

## Stream 中间件

- `StreamMiddleware`: 每次创建流时触发; client 在 next 返回后 stream 创建完成, server 在 next 返回后 handler 处理完毕;
- 类型: client `cep.StreamEndpoint func(ctx) (stream, err)`; server `sep.StreamEndpoint func(ctx, stream) error`;
- 注入: `client.WithStreamOptions(client.WithStreamMiddleware(...))`, `server.WithStreamOptions(server.WithStreamMiddleware(...))`;

## Recv/Send 中间件

- 流收发消息时触发, res/req 为真实消息;
- `StreamRecvMiddleware`: next 前数据未收到, res 为空; next 后数据已收到或报错;
- `StreamSendMiddleware`: next 前 req 为真实请求; next 后发送完成或报错;
- 注入: `WithStreamRecvMiddleware` / `WithStreamSendMiddleware`;

## Unary 中间件

- `UnaryMiddleware`: 只对非流式方法生效, 签名与原生 `WithMiddleware` 一致;
- 原生 `WithMiddleware` 可同时作用于 streaming 方法;
- 注入: `client.WithUnaryOptions(client.WithUnaryMiddleware(mw))`, `server.WithUnaryOptions(...)`;

## 业务异常(流场景)

- Server 返回 `kerrors.NewBizStatusErrorWithExtra(...)` 作为流的错误;
- Client `Recv` 返回 err 后 `kerrors.FromBizStatusError(err)` 还原业务异常;
- 非业务异常会被封装为 `*thrift.ApplicationException`, 只能拿到 Message;
- 流发送错误后不能再发送任何消息;

## StreamEventHandler

- v0.16.0+ 提供流式细粒度事件(StreamStart/RecvHeader/Recv/Send/Finish);
- 与旧 `StreamEventReporter`(仅 Send/Recv)兼容;
- 按 Client/Server 视角实现 `ClientStreamEventHandler` / `ServerStreamEventHandler`, 只填关心字段;
- 注入: `WithStreamOptions(WithStreamEventHandler(handler))`;
