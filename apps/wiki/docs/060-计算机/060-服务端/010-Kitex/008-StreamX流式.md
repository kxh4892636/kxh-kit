---
id: 4c90658c-7064-4543-8392-1b5220b33963
anki: true
---

# StreamX 流式

## 什么时候必须用流式？

- 定义: 一次调用内多次收发;
- 不需要: 创建、查询、更新、删除这类一次请求一次响应的接口;
- 需要: 上传多段数据、持续返回结果或双向会话;
- 选型: 先明确哪一方要多次发送; Thrift 可选 TTHeader Streaming 或 gRPC Streaming，Protobuf 用 gRPC Streaming;
- 生成: Kitex tool **v0.13.0+**，流式 IDL 加 `-streamx`;
- 选型原理: 持续通信与背压见 [流式与长连接](../000-服务端知识/070-通信/020-选型与边界.md);

## 三种流各自怎么结束？

| 形态       | 客户端                                                  | 服务端                                               |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------- |
| 客户端上传 | 多次 `Send` 后 `CloseAndRecv`，或 `CloseSend` 后 `Recv` | `Recv` 遇 `io.EOF` 结束接收，`SendAndClose` 返回结果 |
| 服务端推送 | 发出请求后循环 `Recv`; `io.EOF` 为正常结束              | 多次 `Send` 并检查每次错误，Handler 返回时结束       |
| 双向会话   | `CloseSend` 只表示发送结束，接收仍要读到 `io.EOF`       | 任何失败都要通知另一个协程退出                       |

## 客户端上传流怎么写？

```go
func upload(ctx context.Context, cli fileservice.Client, chunks [][]byte) (*api.UploadResponse, error) {
	stream, err := cli.UploadFile(ctx)
	if err != nil {
		return nil, fmt.Errorf("open upload stream: %w", err)
	}
	for _, chunk := range chunks {
		if err := stream.Send(&api.Chunk{Data: chunk}); err != nil {
			return nil, fmt.Errorf("send chunk: %w", err)
		}
	}
	resp, err := stream.CloseAndRecv() // 不发结束信号，服务端会一直等下一段
	if err != nil {
		return nil, fmt.Errorf("close upload stream: %w", err)
	}
	return resp, nil
}
```

- 服务端: 在 `Recv` 收到 `io.EOF` 后用 `SendAndClose` 返回最终结果;
- 陷阱: 不发结束信号，服务端可能一直等下一段数据;

## 流的超时与 goroutine 怎么收？

- 预算: `client.WithStreamRecvTimeout`（v0.16.3 起标记 Deprecated，改用 `WithStreamRecvTimeoutConfig`）或单次 `streamcall.WithRecvTimeout`;
- 双向会话: 用有限队列与明确取消路径，退出时回收 goroutine、timer 与连接;
- 重试: 常规 RPC 重试不适用于 streaming，见 [004](./004-客户端调用.md);
- 排障: 流中断先看 `StreamEventHandler` 的 start、Send、Recv、header、finish，不先调底层参数;
