---
id: 278dfbb4-b2cc-4e0e-b0ce-08aae8641765
---

# 缓存与 ETag

## 缓存有哪两套完全不同的机制？

| 机制                 | 实现                                            | Node 是否可用                                 |
| -------------------- | ----------------------------------------------- | --------------------------------------------- |
| 协商缓存（304）      | `hono/etag` 生成 ETag，客户端带 `If-None-Match` | ✅                                            |
| 响应缓存（CDN/平台） | `hono/cache`，依赖全局 `Cache API`              | ❌ 无全局 `caches`，改用 Redis 或反向代理缓存 |

```ts
import { etag, RETAINED_304_HEADERS } from "hono/etag";

app.use("/assets/*", etag({ weak: false }));
app.use("/assets2/*", etag({ retainedHeaders: ["x-message", ...RETAINED_304_HEADERS] }));
```

- ETag 默认用 SHA-1 摘要；304 响应只会带回 `Cache-Control`、`Date`、`ETag`、`Expires`、`Vary` 等保留头;
- `weak: true` 时 ETag 带 `W/` 前缀，适合内容语义相同但字节可能不同的响应;
- 想在 Node 上做服务端缓存，用 Redis 或「ETag + 反代」，不要把 `hono/cache` 当通用方案;

## `Cache-Control` 该怎么写？

```ts
// 静态资源：内容哈希文件名 + 长缓存
c.header("Cache-Control", "public, max-age=31536000, immutable");

// 接口：不缓存
c.header("Cache-Control", "no-store");

// 需要校验：每次都回源确认
c.header("Cache-Control", "no-cache");
```

| 指令        | 含义                         |
| ----------- | ---------------------------- |
| `max-age`   | 浏览器可缓存秒数             |
| `no-store`  | 完全不缓存                   |
| `no-cache`  | 可缓存但每次回源校验         |
| `private`   | 只允许浏览器缓存，不允许 CDN |
| `immutable` | 资源不会变，禁止刷新校验     |

- Hono 不会替你写 `Cache-Control`，需要显式设置;
- 带用户身份的接口一律 `private` 或 `no-store`;

## 平台缓存中间件的适用边界是什么？

- `hono/cache` 依赖 Web 标准 `Cache API`，Cloudflare Workers / Deno 有，Node 没有;
- 想在多运行时通用，就自己封装一层缓存（Redis 或进程内 LRU），在 Handler 里读写;
- 静态资源交给 CDN 或反向代理，比在应用里做缓存更省;
