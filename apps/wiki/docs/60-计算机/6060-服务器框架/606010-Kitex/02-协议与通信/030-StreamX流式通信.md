---
id: 4c90658c-7064-4543-8392-1b5220b33963
---

# StreamX 流式通信

## 三种流模型

- client streaming: Client 多次 Send，Server 最后返回一个最终结果;
- server streaming: Client 发一个请求，Server 多次 Send;
- bidirectional streaming: 双方独立 Send/Recv，像双向通话;

## Kitex 流式通信的编程模型

- Recv 返回 `io.EOF` 表示流正常结束;
- 发送方不再发送时应调用 `CloseSend` 或 `CloseAndRecv`，让对端知道“我说完了”;
- context cancel 会控制整个 stream 生命周期;

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

## 流式通信的生命周期规则

- Client streaming: Client 必须 `CloseAndRecv`，或 `CloseSend` 后 `Recv`;
- Server streaming: Client 持续 `Recv`，遇到 `io.EOF` 正常结束;
- Bidirectional: 发送方完成后 `CloseSend`; 双方 Recv 都必须识别 `io.EOF`;
- Handler 返回: Server 完成流并发送 trailer; 业务通常不主动关闭底层 stream;
- context cancel: TTHeader Streaming 新版本支持级联 cancel;

## 流式通信中资源泄漏的常见问题

- 忘记 `CloseSend`: Server 可能一直等待更多数据;
- 持久化 stream: context 与连接长期存活，形成资源泄漏;
- Handler 不退出: 客户端无法收到结束状态;
- Recv 无 deadline: 对端错误使用时 goroutine 永久等待;
- 监控: 使用 StreamEventHandler 观察开始、Send、Recv、header 与结束事件;
