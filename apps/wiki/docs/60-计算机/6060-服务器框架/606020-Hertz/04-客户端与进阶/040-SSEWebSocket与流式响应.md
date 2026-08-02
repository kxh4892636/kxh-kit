---
id: dba70173-038e-4416-9ad7-54d39ebbc677
---

# SSE、WebSocket 与流式响应

## 能力对比

| 能力      | 方向            | 协议形态      | 适用场景             |
| --------- | --------------- | ------------- | -------------------- |
| 普通 HTTP | 请求后单响应    | 有界 body     | CRUD、查询           |
| SSE       | Server → Client | 文本事件流    | 通知、进度、事件订阅 |
| WebSocket | 双向            | message/frame | 实时协作、聊天、控制 |
| 流式 body | 单向或上传      | 字节流        | 大文件、持续生成内容 |

## SSE

- Content-Type: `text/event-stream`;
- event: `id`、`event`、`data` 与可选 `retry`;
- flush: 每个事件及时写出，代理不得缓冲整个响应;
- reconnect: 客户端会重连，可用 Last-Event-ID 恢复;
- heartbeat: 周期注释或事件检测断连;

## WebSocket

- upgrade: 从 HTTP 握手升级为长连接;
- origin: 浏览器场景校验 Origin，不把 CORS 当作 WebSocket 防护;
- read/write loop: 单独管理读写并设置 deadline、ping/pong;
- backpressure: 为每个连接限制队列，慢客户端不得拖垮广播;
- authentication: 握手时认证，长连接期间处理权限失效与 Token 过期;

## 生命周期

- context: 客户端断开和服务关闭时取消生产者;
- goroutine: 每个连接的 goroutine、channel 和 timer 都有退出路径;
- shutdown: 停止接受新连接，通知客户端重连，再等待有限时间;
- capacity: 监控活跃连接、发送队列、丢弃事件和写延迟;

## 选择原则

- 只需服务端推送且浏览器原生消费: 优先 SSE;
- 需要低延迟双向 message: 使用 WebSocket;
- 大文件或生成式响应: 使用流式 body;
- 频率低且允许延迟: 轮询可能更简单、更易运维;
