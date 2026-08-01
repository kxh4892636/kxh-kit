---
id: 4889204d-cf35-4768-b2a9-1bba2a62eea0
---

# Kitex metainfo 元信息

## 概念

- IDL 只定义业务数据结构，临时或不固定的信息通过元信息传递;
- 必须使用支持元信息的传输协议（TTHeader、HTTP2/gRPC）;
- Kitex 不直接读写协议元信息，而是通过基础库 `github.com/bytedance/gopkg/cloud/metainfo` 解耦;

## 正向传递

- `metainfo.WithValue(ctx, key, value)`: 临时元信息（transient）;
- `metainfo.WithPersistentValue(ctx, key, value)`: 持续元信息（persistent），用于日志 ID、染色等跨链路透传;
- Server 接收: `metainfo.GetValue(ctx, key)` / `GetPersistentValue(ctx, key)`;
- 继续调用下游时直接传收到的 ctx，持续元信息自动透传;

## 反向传递

- Client 先 `ctx = metainfo.WithBackwardValues(ctx)` 标记接收;
- 调用后 `metainfo.RecvBackwardValue(ctx, key)` 取单个、`RecvAllBackwardValues(ctx)` 取全部;
- Server 用 `metainfo.SendBackwardValue(ctx, key, value)` 回传;
- oneway 方法不适用;

## gRPC metadata

- Kitex gRPC 场景可用 metainfo，key 需满足大写 + 下划线格式;
- 也兼容原生 metadata 方式，但二者不可混合使用;
- 正向: `metadata.AppendToOutgoingContext(ctx, ...)`; Server 用 `metadata.FromIncomingContext`;
- 反向 Unary: `nphttp2.SendHeader/SetHeader/SetTrailer`（必须用 Kitex fork 的 metadata 包）; Client 用 `nphttp2.GRPCHeader/GRPCTrailer` 提前设置接收变量;
- 反向 Streaming: `stream.SetHeader/SetTrailer`; Client `stream.Header()` / `stream.Trailer()`;
- header/trailer 的 key 不能包含大写字母;

## 流式元信息

- 每个 stream 只在创建时透传元信息，发送消息无法透传;
- gRPC streaming 的 key 需大写 + 下划线，TTHeader streaming 无此要求;
