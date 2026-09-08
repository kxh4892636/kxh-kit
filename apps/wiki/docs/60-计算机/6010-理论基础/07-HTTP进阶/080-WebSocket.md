---
id: bc468b07-af4b-4835-aeb4-519e167e7179
---

# WebSocket

## WebSocket 是什么，为什么需要它?

- WebSocket 协议: 基于 HTTP/HTTPS，全双工通信，持续时间内保持连接状态;
- 通俗解释: 普通 HTTP 是"客户端问一句、服务器答一句"，WebSocket 把这条连接留成双向通道，双方随时都能说话;
- 动机: 全双工意味着服务器可以实时推送，不必等客户端再来问一次，优于轮询;
- 代价: 连接要一直保持，属于长连接，性能耗费大;

| 阶段     | 使用的协议 | 谁能发起             |
| -------- | ---------- | -------------------- |
| 握手     | HTTP/HTTPS | 客户端先发起         |
| 握手之后 | WebSocket  | 客户端和服务器都可以 |

## 一次握手时客户端发什么?

- 握手请求: 客户端发送 HTTP/HTTPS 请求;
- `Upgrade` 首部: 告知服务器使用 WebSocket 协议;
- `Sec-WebSocket-Key` 首部: 作为 key 标识;
- `Sec-WebSocket-Protocol` 首部: 表示支持协议;

```bash
GET /chat HTTP/1.1
Host: server.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Origin: http://example.com
Sec-WebSocket-Protocol: chat, superchat
Sec-WebSocket-Version: 13
```

## 服务器如何回应握手?

- 握手响应: 服务器生成 HTTP(S) 握手响应;
- 状态码: 服务器返回 101 状态码，表示切换协议;
- `Sec-WebSocket-Protocol` 首部: 服务器用它在客户端给出的候选里选择 websocket 协议;
- `Sec-WebSocket-Accept` 首部: 服务器基于 `Sec-WebSocket-Key` 构造;

```bash
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: chat
```

## 客户端为什么要校验 Sec-WebSocket-Accept?

- 校验步骤: 客户端接受 HTTP(S) 握手响应后，先校验 `Sec-WebSocket-Accept` 首部;
- 校验通过: 才建立 websocket 连接，之后不再使用 HTTP/HTTPS 协议;
- 校验的意义: `Sec-WebSocket-Accept` 由服务器基于客户端的 `Sec-WebSocket-Key` 构造，校验它才能确认握手是对这次请求的回应;

## WebSocket 相比轮询有哪些优点?

- 全双工: 实时推送，优于轮询;
- 降低网络开销: 一次握手，持久保持连接，避免反复连接开销;
- 更少的数据量: 二进制数据帧传输数据，传输效率高;
- 跨域通信: 支持跨域通信;

![WebSocket 握手](../images/2024-03-04-19-21-22.png)
