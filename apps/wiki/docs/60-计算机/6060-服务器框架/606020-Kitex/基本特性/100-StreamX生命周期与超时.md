---
id: ab48f07d-28c4-4455-b2af-73b54afa6aa8
---

# Kitex StreamX 生命周期与超时

## ctx cancel 控制生命周期

- gRPC 与 TTHeader Streaming 均支持基于 ctx cancel 结束 Stream;
- TTHeader Streaming 优化了错误描述, 便于级联 cancel 排查(Kitex >= v0.15.1);
- 上游主动 cancel: `ctx, cancel := context.WithCancel(ctx)`, 业务判断特殊响应后 `cancel()` 结束下游 Stream;
- 下游感知: `errors.Is(err, kerrors.ErrStreamingCanceled)` 判断上游 cancel;

## TTHeader 错误描述

```text
[ttstream error, code=12007] [server-side stream] [canceled path: ServiceA] user code invoking stream RPC with context processed by context.WithCancel or context.WithTimeout, then invoking cancel() actively
```

- `[code=12007]`: 错误码; `[server-side stream]`: 抛出侧; `[canceled path: ServiceA]`: cancel 发起方;

## TTHeader 错误码

- 12001: 业务异常(handler 返回 err);
- 12002: Header Frame 错误; 12003: 业务异常解析失败; 12004: Frame 解析失败;
- 12005: 非法操作(如 CloseSend 后仍 Send);
- 12006: 连接关闭; 12007: 上游主动 cancel;
- 12008: `cancelCause(err)`; 12009: 被下游 cancel; 12010: 被上游 cancel;
- 12011: 级联 cancel(如 gRPC ctx 被 cancel 级联 TTHeader Streaming);
- 12012: handler 提前退出但异步 goroutine 仍用 Recv/Send;
- 12013: 连接关闭导致流结束(常见于服务迁移/更新);

## 超时控制

- Recv Timeout 支持: `client.WithStreamOptions(client.WithStreamRecvTimeout(timeout))` 客户端级;
- 接口级 (v0.13.0+): `streamcall.WithRecvTimeout(timeout)`;
- 流整体超时: 创建 Stream 时用带 Deadline 的 ctx(gRPC 场景经 `grpc-timeout` 传递);
