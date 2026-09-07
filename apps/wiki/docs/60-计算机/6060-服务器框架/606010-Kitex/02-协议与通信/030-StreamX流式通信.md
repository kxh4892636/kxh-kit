---
id: 4c90658c-7064-4543-8392-1b5220b33963
---

# StreamX 流式通信

什么需求适合使用 StreamX？如何定义并实现 client、server 或双向 streaming？怎样处理 EOF、取消、半关闭、背压和超时？

## 使用要点

- StreamX: Kitex 提供的统一流式编程 API; 在一个 RPC 调用内可以多次发送或接收消息;
- 价值: 适合推送、上传、实时对话等无法用一次请求响应表达的场景;

## 三种流模型

- client streaming: Client 多次 Send，Server 最后返回一个最终结果;
- server streaming: Client 发一个请求，Server 多次 Send;
- bidirectional streaming: 双方独立 Send/Recv，像双向通话;
- 协议: gRPC streaming 或 TTHeader Streaming; 生成代码与 transport 必须匹配;

## 编程模型

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

## 生命周期规则

- Client streaming: Client 必须 `CloseAndRecv`，或 `CloseSend` 后 `Recv`;
- Server streaming: Client 持续 `Recv`，遇到 `io.EOF` 正常结束;
- Bidirectional: 发送方完成后 `CloseSend`; 双方 Recv 都必须识别 `io.EOF`;
- Handler 返回: Server 完成流并发送 trailer; 业务通常不主动关闭底层 stream;
- context cancel: TTHeader Streaming 新版本支持级联 cancel;

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

## 常见误区

- 误区: 把 unary 的超时和重试直接套到 stream; 需要重新设计;
- 误区: 忽略 `io.EOF`; 把正常结束当错误处理;
- 误区: 不关闭发送侧; 会导致对端一直阻塞;
