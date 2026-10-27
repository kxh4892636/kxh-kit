---
id: 57d5f379-8180-42c7-9267-25d3f6485d7b
---

# WebSocket 接入

## Node 上的 WebSocket 依赖什么？

- Hono 核心不含 WebSocket 实现，`upgradeWebSocket` 由适配器提供;
- Node 用 `@hono/node-server` 内置的升级能力 + `ws` 包;
- 安装: `npm i ws` 与 `npm i -D @types/ws`;
- 旧包 `@hono/node-ws` 已废弃，不要用;

## 最小可运行示例是什么？

```ts
import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";

const app = new Hono();

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(event.data); // 回声
    },
    onClose: () => console.log("closed"),
  })),
);

const wss = new WebSocketServer({ noServer: true });

serve({
  fetch: app.fetch,
  websocket: { server: wss },
});
```

- 关键点: `new WebSocketServer({ noServer: true })`，把升级交给 Hono 适配器判断路由;
- 路由必须是 `app.get('/ws', upgradeWebSocket(...))` 的形态;

## 生命周期事件有哪些？

| 事件                   | 时机                                           | 用途                   |
| ---------------------- | ---------------------------------------------- | ---------------------- |
| `onOpen(event, ws)`    | 连接建立（Node/Bun/Deno 支持，Workers 不支持） | 初始化定时器、加入房间 |
| `onMessage(event, ws)` | 收到消息                                       | 业务处理、广播         |
| `onClose(event, ws)`   | 断开                                           | 清理定时器、退出房间   |
| `onError(event, ws)`   | 出错                                           | 记录日志               |

```ts
app.get(
  "/ws",
  upgradeWebSocket(() => {
    let timer: NodeJS.Timeout;
    return {
      onOpen(_e, ws) {
        timer = setInterval(() => ws.send(new Date().toISOString()), 1000);
      },
      onClose() {
        clearInterval(timer); // 必须清理，否则连接关闭后仍占 CPU
      },
    };
  }),
);
```

## 客户端怎么连（含类型安全方式）？

```ts
// 普通浏览器
const ws = new WebSocket("ws://localhost:3000/ws");

// 类型安全客户端：导出 app 类型后用 hc
const client = hc<typeof app>("http://localhost:3000");
const socket = client.ws.$ws(0); // 与服务端 app.get('/ws', ...) 对应
```

- `hc` 的用法见 [hc 类型安全客户端](../090-按需查阅/070-hc调用与传参.md);
- 自己写前端时，把 `ws://` 与 `wss://` 按部署环境区分，不要硬编码;
