---
id: 9240228a-5da4-49e7-8bc6-430f63f88c5b
---

# Helper 速查

## 有哪些 Helper，各解决什么？

| Helper    | 导入                         | 解决什么                                                              |
| --------- | ---------------------------- | --------------------------------------------------------------------- |
| Cookie    | `hono/cookie`                | 读写/删除（含签名）Cookie                                             |
| JWT       | `hono/jwt`                   | `sign` / `verify` / `decode`                                          |
| Streaming | `hono/streaming`             | `stream` / `streamText` / `streamSSE`                                 |
| WebSocket | `@hono/node-server`          | `upgradeWebSocket`（Node 专用）                                       |
| HTML      | `hono/html`                  | 模板字符串写 HTML，`raw()` 关闭转义                                   |
| CSS       | `hono/css`                   | CSS-in-JS，`css` / `cx`，配合 JSX                                     |
| JSX       | `hono/jsx`                   | JSX 运行时（需配 `jsxImportSource`）                                  |
| Testing   | `hono/testing`               | `testClient` 类型安全测试客户端                                       |
| Factory   | `hono/factory`               | `createFactory` / `createApp` / `createMiddleware` / `createHandlers` |
| Route     | `hono/route`                 | `routePath` / `matchedRoutes` / `basePath`                            |
| Accepts   | `hono/accepts`               | 按 `Accept-*` 头协商返回内容                                          |
| ConnInfo  | `@hono/node-server/conninfo` | `getConnInfo(c).remote.address`                                       |
| Adapter   | `hono/adapter`               | `env()` 跨运行时取环境变量、`getRuntimeKey()`                         |
| Proxy     | `hono/proxy`                 | `proxy(url, c.req)` 反向代理                                          |
| Dev       | `hono/dev`                   | `showRoutes` / `getRouterName`                                        |
| SSG       | `hono/ssg`                   | 静态站点生成（构建期能力）                                            |

## 哪些是核心开发必用？

| Helper           | 用在哪                | 详见                                                          |
| ---------------- | --------------------- | ------------------------------------------------------------- |
| `hono/cookie`    | 登录态、会话          | [Cookie 与会话](../002-服务端开发/160-Cookie读写.md)          |
| `hono/jwt`       | 签发/校验 token       | [JWT 与 JWK](../002-服务端开发/080-JWT与JWK.md)               |
| `hono/streaming` | 大响应、SSE           | [流式响应](../090-按需查阅/110-流式响应.md)                   |
| `hono/factory`   | 中间件与 Handler 复用 | [不写控制器，用 factory](../002-服务端开发/020-不写控制器.md) |
| `hono/testing`   | 单测                  | [测试](../002-服务端开发/200-用app.request测试.md)            |

## 哪些属于「按需查、别默认引入」？

- `hono/css`、`hono/jsx`：只在要输出 HTML 页面时用，见 [JSX 与 HTML 渲染](./090-模板字符串渲染.md);
- `hono/ssg`：构建期把路由渲染成静态文件，纯 API 服务不需要;
- `hono/proxy`、`hono/accepts`、`hono/route`、`hono/adapter`、`hono/dev`：各有明确场景，见 [Helper 与运行时速查](./040-Proxy与内容协商.md);
