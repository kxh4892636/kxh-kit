---
id: 57d5f379-8180-42c7-9267-25d3f6485d7b
anki: true
---

# WebSocket

## Node 上怎么接 WebSocket，生命周期怎么管？

- 关键: `new WebSocketServer({ noServer: true })`，把升级交给 Hono 适配器按路由判断;
- 组成: `upgradeWebSocket` + `ws` 提供双向连接，鉴权、房间与关闭语义由应用处理; 旧包 `@hono/node-ws` 已废弃，用 `@hono/node-server` 的 `upgradeWebSocket`;
- 生命周期: `onOpen(event, ws)`（Node/Bun/Deno 支持，Workers 不支持）、`onMessage`、`onClose`、`onError`;
- 清理: `onClose` 里必须 `clearInterval` / 退出房间，否则连接关闭后仍占 CPU 或向死连接广播;
- 冲突: `upgradeWebSocket` 内部改响应头，与会改头的中间件（CORS/compress）同挂可能报 `headers immutable`; WebSocket 路径单独挂载;

```ts
import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws"; // npm i ws && npm i -D @types/ws

const app = new Hono();

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(event.data);
    }, // 回声
  })),
);

const wss = new WebSocketServer({ noServer: true });
serve({ fetch: app.fetch, websocket: { server: wss } });
```

## 鉴权、心跳、房间与背压怎么处理？

- 鉴权: 放同路径前置中间件，未通过返回 `Response` 短路，升级不会发生; 长连接要在消息层再校验 token 过期;
- 心跳: 30s 左右 ping;
- 房间: `Map<string, Set<WebSocket>>` 单进程有效，多实例要 Redis Pub/Sub 或专门网关;
- 背压: `ws.send` 不阻塞，客户端慢时要队列上限与丢弃策略; 消息定 JSON 信封（`type`/`payload`）;

## 房间怎么进出，退出时先关谁？

- 进出: `onOpen` 加入房间，`onClose` 删除并在空房间时删表;
- 退出: 先逐连接 `ws.close(1001, "server shutdown")` 通知重连，再 `wss.close()`、`server.close()`; 客户端要指数退避，避免惊群;

```ts
const rooms = new Map<string, Set<WebSocket>>();

app.get(
  "/ws/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room");
    const peers = () => rooms.get(room) ?? rooms.set(room, new Set()).get(room)!;
    return {
      onOpen(_e, ws) {
        peers().add(ws as unknown as WebSocket);
      },
      onClose(_e, ws) {
        peers().delete(ws as unknown as WebSocket);
        if (peers().size === 0) rooms.delete(room);
      },
    };
  }),
);
```

- 整体退出顺序: [优雅退出](../../000-服务端知识/040-可靠性/040-优雅退出/010-退出顺序.md); 双向通信约束: [流式与长连接](../../000-服务端知识/070-通信/020-流式与长连接/010-选型与边界.md);
