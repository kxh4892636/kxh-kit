---
id: 4c90658c-7064-4543-8392-1b5220b33963
---

# 持续收发的使用入口

## 普通服务端开发需要先学习 StreamX 吗？

- 跳过条件: 创建、查询、更新、删除等一次请求一次响应的接口，不需要 StreamX;
- 使用条件: 上传多段数据、持续返回结果或双向会话时才引入；先明确下面哪一方要多次发送;
- 生成: Kitex tool v0.13.0+ 使用流式 IDL 与 `-streamx`；Thrift 可选 TTHeader Streaming 或 gRPC Streaming，Protobuf 使用 gRPC Streaming;

## 如何结束一次客户端上传流？

- Client: 多次 Send 后调用 CloseAndRecv，或 CloseSend 后 Recv，告诉服务端数据已经发完;
- Server: Recv 遇到 io.EOF 后结束接收，并用 SendAndClose 返回最终结果;
- 陷阱: 不发结束信号，服务端可能一直等下一段数据;

## 如何消费一次服务端推送流？

- Client: 发出请求后循环 Recv；io.EOF 表示正常结束，其他错误立即返回;
- Server: 多次 Send，检查每次发送错误，Handler 返回时结束流;
- 预算: TTHeader Streaming 使用 WithStreamRecvTimeout 或单次 streamcall.WithRecvTimeout，避免无限等待;

## 如何结束一次双向会话？

- 发送侧: 发送结束后 CloseSend，不能直接假设接收也已经结束;
- 接收侧: 循环读到 io.EOF，任何失败都通知另一个工作协程退出;
- 资源: 用有限队列和明确取消路径，退出时回收 goroutine、timer 与连接;
- 观测: 遇到流中断再查 StreamEventHandler 与生命周期文档，不先调底层参数;

## 需要核对具体用法时查哪里？

- 官方入口: [StreamX 基础流编程](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Tutorials/basic-feature/streamx/StreamX_Basic_Programming.md)、[StreamX 流超时控制](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/kitex/Tutorials/basic-feature/streamx/StreamX_Timeout_Control.md);
