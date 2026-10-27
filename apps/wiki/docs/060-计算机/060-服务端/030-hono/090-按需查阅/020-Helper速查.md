---
id: 9240228a-5da4-49e7-8bc6-430f63f88c5b
anki: true
---

# Helper 速查

## 要哪项能力就 import 哪个 Helper？

- 查法: 先按能力定位导入路径，再看表后的取值细节;
- 核心五个: `cookie`、`jwt`、`streaming`、`factory`、`testing`;

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

- 按需引入: `hono/css` / `hono/jsx` 只在输出 HTML 时用; `hono/proxy` / `hono/accepts` 见 [代理与内容协商](./030-代理与内容协商.md); `hono/ssg` 是构建期能力，纯 Node API 服务不需要;

## 运行时、来源 IP 与路由信息怎么取？

- 三个来源: `env()` 取环境变量、`getConnInfo()` 取连接地址、`hono/route` 取当前路由;

```ts
import { env, getRuntimeKey } from "hono/adapter";
import { getConnInfo } from "@hono/node-server/conninfo";
import { routePath, basePath, matchedRoutes } from "hono/route";

app.get("/posts/:id", (c) => {
  const { NAME } = env<{ NAME: string }>(c); // Node 上读 process.env
  const { remote } = getConnInfo(c);
  return c.json({
    NAME,
    runtime: getRuntimeKey(),
    ip: remote.address,
    route: routePath(c), // '/posts/:id'
    base: basePath(c),
    matched: matchedRoutes(c).length,
  });
});
```

## env、来源 IP 与路由参数的取值边界在哪？

- `env<T>(c)`: 只在「同一份代码跑多运行时」时用; 纯 Node 直接 `process.env`;
- `getConnInfo(c).remote.address`: 反向代理后是代理地址; 真实来源要读 `X-Forwarded-For` 并先信任代理; 代理后来源判定: [请求边界与来源可信](../../000-服务端知识/030-安全/050-请求边界与来源可信.md);
- `basePath(c)`: 含实际参数值; `baseRoutePath(c)` 是声明里的模式; `routePath(c, -1)` 取最后一个匹配;

## 启动时怎么确认路由与中间件顺序？

- `showRoutes(app, { verbose: true })` 与 `getRouterName(app)`: 来自 `hono/dev`，启动时打印能发现路径与中间件顺序错误; 不启服务可用 `npx hono routes`; 路由写法: [001-快速上手](../001-快速上手/README.md);
