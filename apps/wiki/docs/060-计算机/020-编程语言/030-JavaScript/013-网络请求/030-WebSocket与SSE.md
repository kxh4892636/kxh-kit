---
id: a3af5778-3674-4974-bc44-d2daf001b21e
---

# WebSocket 与 SSE

## WebSocket 如何建立双向通信？

```js
const socket = new WebSocket("ws://www.example.com/server.php");
socket.send(JSON.stringify({ type: "ping" }));
socket.onmessage = (event) => console.log(event.data);
```

| 成员                                           | 含义                                        |
| ---------------------------------------------- | ------------------------------------------- |
| `CONNECTING`/`OPEN`/`CLOSING`/`CLOSE`          | 连接状态常量 (0/1/2/3)                      |
| `readyState`                                   | 当前连接状态                                |
| `url` / `protocol` / `extensions`              | 地址 / 协商协议 / 扩展                      |
| `bufferedAmount`                               | 排队待发送字节数                            |
| `send(data)`                                   | 发送数据, 支持字符串、`ArrayBuffer`、`Blob` |
| `close(code?, reason?)`                        | 关闭连接                                    |
| `onopen` / `onerror` / `onclose` / `onmessage` | 连接与消息事件                              |

- 消息事件: `MessageEvent.data` 携带消息内容;
- 与 SSE 的区别: WebSocket 是双向通道, SSE 只是服务端到客户端的单向推送;

## SSE 的报文格式是什么？

- 编码: UTF-8;
- 结构: 一条消息由若干字段行组成, 消息之间用空行 (`\n\n`) 分隔, 字段内换行用 `\n`;

| 字段    | 含义                         |
| ------- | ---------------------------- |
| `:`     | 注释                         |
| `data`  | 数据内容                     |
| `id`    | 标识符, 用于断线重连         |
| `event` | 自定义事件名, 默认 `message` |
| `retry` | 浏览器重连间隔 (毫秒)        |

```text
: this is a test stream

data: some text

data: another message
data: with two lines
```

## SSE 客户端如何接收？

```js
const source = new EventSource(url); // 只能发起 GET 请求
source.addEventListener("message", (event) => console.log(event.data));
source.close();
```

| 成员                               | 含义               |
| ---------------------------------- | ------------------ |
| `url` / `readyState` / `protocol`  | 地址 / 状态 / 协议 |
| `close()`                          | 关闭连接           |
| `onopen` / `onmessage` / `onerror` | 连接与消息事件     |

## SSE 服务端如何响应？

```js
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.write(`data: ${JSON.stringify(payload)}\n\n`);
res.end();
```
