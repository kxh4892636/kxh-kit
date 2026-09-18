---
id: 7addb873-302b-4c2c-9253-5850fbdce9a3
---

# Beacon

## 页面卸载时为什么需要 Beacon？

- 异步请求的问题: 页面卸载后, 异步 `XMLHttpRequest` 与 `fetch` 发送的请求不保证完成;
- 同步请求的问题: 同步 `XMLHttpRequest` 虽能发出, 但会阻塞主线程;
- 方案: 用 `navigator.sendBeacon` 发送不阻塞的 POST 请求, 即使页面已关闭也能送达;

## sendBeacon 如何使用？

```js
navigator.sendBeacon("https://example.com/analytics", JSON.stringify({ foo: "bar" }));
```

- 方法签名: `sendBeacon(url, data)`, 返回是否成功排入发送队列;
- 请求方式: 固定为 POST;
- 典型场景: 关闭页面时上报埋点、日志或统计信息;
- 对照: 普通请求的发送方式与中断见 [Fetch](./010-Fetch.md);
