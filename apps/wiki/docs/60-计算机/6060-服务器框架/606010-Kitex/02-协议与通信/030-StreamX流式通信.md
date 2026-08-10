---
id: 4c90658c-7064-4543-8392-1b5220b33963
---

# StreamX 流式通信

模型包含什么？生命周期规则如何运作？治理差异是什么？常见泄漏是什么？

## 模型

- StreamX: Kitex 的统一 streaming API; 支持 client、server、bidirectional streaming;
- client streaming: Client 多次 Send，Server 返回一个最终结果;
- server streaming: Client 发一个请求，Server 多次 Send;
- bidirectional streaming: 双方独立 Send/Recv;
- 协议: gRPC streaming 或 TTHeader Streaming; 生成代码与 transport 必须匹配;

## 生命周期规则

- Client streaming: Client 必须 `CloseAndRecv`，或 `CloseSend` 后 `Recv`;
- Server streaming: Client 持续 `Recv`，遇到 `io.EOF` 正常结束;
- Bidirectional: 发送方完成后 `CloseSend`; 双方 Recv 都必须识别 `io.EOF`;
- Handler 返回: Server 完成流并发送 trailer; 业务通常不主动关闭底层 stream;
- context cancel: 控制整个 stream 生命周期; TTHeader Streaming 新版本支持级联 cancel;

```go
stream, err := cli.ListUsers(ctx, &api.ListUsersRequest{})
if err != nil {
	return fmt.Errorf("open stream: %w", err)
}
for {
	user, err := stream.Recv(ctx)
	if errors.Is(err, io.EOF) {
		break
	}
	if err != nil {
		return fmt.Errorf("receive user: %w", err)
	}
	log.Printf("user=%d", user.ID)
}
```

## 治理差异

- timeout: unary `WithRPCTimeout` 不直接等价于流超时; 可为每次 Recv 设置 deadline;
- retry: streaming 不支持常规请求重试; 业务层设计 checkpoint 或幂等续传;
- fallback: gRPC streaming 不支持 unary fallback;
- middleware: 区分 stream、Recv/Send 与 unary middleware;
- metainfo: 正向、反向元信息接口与 PingPong 不完全相同;

## 常见泄漏

- 忘记 `CloseSend`: Server 可能一直等待更多数据;
- 持久化 stream: context 与连接长期存活，形成资源泄漏;
- Handler 不退出: 客户端无法收到结束状态;
- Recv 无 deadline: 对端错误使用时 goroutine 永久等待;
- 监控: 使用 StreamEventHandler 观察开始、Send、Recv、header 与结束事件;
