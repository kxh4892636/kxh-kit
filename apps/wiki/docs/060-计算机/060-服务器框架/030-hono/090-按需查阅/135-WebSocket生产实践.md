---
id: 4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f
---

# WebSocket 生产实践

## 怎么和中间件共存？

- `upgradeWebSocket` 内部会改响应头；如果同时挂了会改头的中间件（如 CORS），可能报「headers immutable」错误;
- 建议: WebSocket 路径单独挂载，不套用 CORS/compress 等响应改写中间件;
- 鉴权放在同路径的前置中间件里，未通过就返回 `Response` 短路，升级不会发生：

```ts
app.use("/ws", async (c, next) => {
  if (!c.req.query("token")) return c.json({ ok: false, error: "unauthorized" }, 401);
  await next();
});

app.get(
  "/ws",
  upgradeWebSocket(() => ({ onMessage() {} })),
);
```

## 生产环境要注意什么？

| 事项       | 说明                                                   |
| ---------- | ------------------------------------------------------ |
| 心跳       | 30s 左右 ping，防止中间层（Nginx/ELB）静默断链         |
| 鉴权有效期 | 连接建立时校验一次；长连接要在消息层再校验过期         |
| 广播规模   | 单进程内存房间表，多实例需 Redis Pub/Sub 或专门网关    |
| 背压       | `ws.send` 不阻塞，客户端慢时要做队列上限与丢弃策略     |
| 消息格式   | 定好 JSON 信封（`type`/`payload`），便于扩展与版本兼容 |

## 如何做房间与广播？

```ts
const rooms = new Map<string, Set<WebSocket>>();

app.get(
  "/ws/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room");
    return {
      onOpen(_e, ws) {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(ws as unknown as WebSocket);
      },
      onMessage(event, ws) {
        for (const peer of rooms.get(room) ?? []) peer.send(String(event.data));
        void ws;
      },
      onClose(_e, ws) {
        rooms.get(room)?.delete(ws as unknown as WebSocket);
        if (rooms.get(room)?.size === 0) rooms.delete(room);
      },
    };
  }),
);
```

- 房间表放内存只适合单实例；多实例要外置到 Redis 并用发布订阅转发;
- 断开时一定要从房间移除，否则广播会往死连接写;

## 优雅退出怎么处理长连接？

```ts
process.on("SIGTERM", () => {
  for (const peers of rooms.values()) {
    for (const ws of peers) ws.close(1001, "server shutdown");
  }
  wss.close();
  server.close(() => process.exit(0));
});
```

- 先通知客户端重连（关闭码 1001），再关服务端;
- 关闭顺序与整体退出流程见 [优雅退出与健康检查](../003-上线/030-优雅退出.md);
- 客户端要实现指数退避重连，避免服务重启造成惊群;
