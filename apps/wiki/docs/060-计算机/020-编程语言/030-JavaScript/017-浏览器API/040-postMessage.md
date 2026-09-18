---
id: b8075cd6-0915-41c4-b314-bfc758f271f2
---

# postMessage

## postMessage 用于什么场景？

- 场景: 同源下跨窗口通信, 如页面与内嵌 `iframe` 之间;
- 通道: `window.postMessage` 发送, `message` 事件接收;

## postMessage 与 message 事件如何使用？

```js
// 发送
const iframeWindow = document.getElementById("myframe").contentWindow;
iframeWindow.postMessage("A secret", "http://www.wrox.com");

// 接收
window.addEventListener("message", (event) => {
  if (event.origin === "http://www.wrox.com") {
    processMessage(event.data);
    event.source.postMessage("Received!", "http://p2p.wrox.com");
  }
});
```

| 成员                                            | 含义                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| `postMessage(message, targetOrigin, transfer?)` | 发送消息到目标窗口, `targetOrigin` 限定接收方源 |
| `MessageEvent.origin`                           | 发送者的源                                      |
| `MessageEvent.data`                             | 消息内容                                        |
| `MessageEvent.source`                           | 发送者的 `WindowProxy`                          |

- 安全要点: 发送时明确 `targetOrigin`, 接收时校验 `event.origin`, 不要使用通配 `"*"` 发送敏感数据;
- 同源限制: 通信双方需满足同源策略, 片段标识与窗口引用除外;

## 与其它通信方式如何区分？

- `MessageChannel`: 建立点对点端口, 用于线程或窗口之间, 见 [线程间通信](../016-工作者线程/020-线程间通信.md);
- `BroadcastChannel`: 同源上下文广播, 无需持有对端引用;
