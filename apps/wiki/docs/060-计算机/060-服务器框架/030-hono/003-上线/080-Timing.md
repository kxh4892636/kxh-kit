---
id: 565deb51-35e0-424c-a2ee-7e087c8ddc55
---

# Timing

## 想在响应头里看到耗时怎么办？

```ts
import { timing, setMetric, startTime, endTime, wrapTime } from "hono/timing";

app.use(timing());

app.get("/", async (c) => {
  setMetric(c, "region", "cn-north");
  startTime(c, "db");
  const rows = await db.query();
  endTime(c, "db");
  const cache = await wrapTime(c, "cache", redis.get("k"));
  return c.json({ rows, cache });
});
```

- 结果是标准 `Server-Timing` 响应头，浏览器 DevTools 的 Timing 面板能直接看到;
- 只想在部分请求上开启：`timing({ enabled: (c) => c.req.method === 'POST' })`;
- `wrapTime` 会自动处理异常，Promise 抛错时也会结束计时;

## 什么时候该用它，什么时候不该？

| 场景                   | 建议                    |
| ---------------------- | ----------------------- |
| 排查某个接口慢在哪一段 | ✅ 临时开               |
| 浏览器端看资源时序     | ✅ 开在页面路由上       |
| 长期监控、告警         | ❌ 用 APM / Prometheus  |
| 高并发公开接口         | ❌ 额外响应头与计时开销 |

- 它只用于诊断，别把它当监控指标;
- 指标采集与结构化日志的分工见 [日志与结构化日志](./070-日志中间件.md)。

## 如何确认路由注册成了什么？

```ts
import { showRoutes, getRouterName } from "hono/dev";

showRoutes(app); // 打印所有路由与方法
console.log(getRouterName(app)); // 当前实际使用的路由器名

const api = new Hono().basePath("/v1");
showRoutes(api, { verbose: true }); // 连中间件一起打印
```

- 启动时打印一次，能立刻发现「路径写错」「中间件顺序错」;
- 也可以不启服务直接查：`npx hono routes --plain`，见 [用 CLI 做行为回归](../090-按需查阅/050-用CLI做行为回归.md)。
