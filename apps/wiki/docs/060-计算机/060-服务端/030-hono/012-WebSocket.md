---
id: 57d5f379-8180-42c7-9267-25d3f6485d7b
anki: true
---

# WebSocket

## Node 上怎么接，生命周期有几段？

- 关键: `new WebSocketServer({ noServer: true })`，把升级交给适配器按路由判断;
- 用 `@hono/node-server` 的 `upgradeWebSocket`（旧包 `@hono/node-ws` 已废弃）;

```ts
import { serve, upgradeWebSocket } from "@hono/node-server";
import { WebSocketServer } from "ws";

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(event.data); // 回声
    },
  })),
);

const wss = new WebSocketServer({ noServer: true });
serve({ fetch: app.fetch, websocket: { server: wss } });
```

- 生命周期: `onOpen`、`onMessage`、`onClose`、`onError`；`onClose` 里必须 `clearInterval`、退出房间，否则仍占 CPU 或向死连接广播;
- 冲突: `upgradeWebSocket` 会改响应头，与会改头的中间件（CORS/compress）同挂可能报 `headers immutable`，WebSocket 路径单独挂;

## 鉴权、心跳、房间与背压怎么处理？

- 鉴权: 放同路径前置中间件，未通过返回 `Response` 短路，升级不会发生；长连接还要在消息层校验 token 过期;
- 心跳: 30s 左右 ping；消息定 JSON 信封（`type`/`payload`）;
- 房间: `Map<string, Set<WebSocket>>` 只在单进程有效，多实例要 Redis Pub/Sub 或专门网关;
- 背压: `ws.send` 不阻塞，客户端慢时要队列上限与丢弃策略;

## 退出时先关谁？

- 顺序: 先逐连接 `ws.close(1001, "server shutdown")` 通知重连，再 `wss.close()`、`server.close()`；客户端要指数退避，避免惊群;
- 整体退出顺序: [退出顺序](../000-服务端知识/040-可靠性/050-退出顺序.md)；
