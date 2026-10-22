---
id: 0aec6065-081d-4cb2-9f4b-b68a9e1ae6c7
---

# Proxy 与内容协商

## Proxy Helper 怎么用？

```ts
import { proxy } from "hono/proxy";

app.all("/proxy/:path", (c) => {
  return proxy(`http://origin.internal/${c.req.param("path")}`, {
    ...c.req,
    headers: {
      ...c.req.header(),
      "X-Forwarded-Host": c.req.header("host"),
      Authorization: undefined, // 不外泄凭证
    },
  });
});

app.get("/simple", (c) => proxy("https://example.com/"));
```

- 返回可直接发出的 `Response`，会替换 `Accept-Encoding` 并清掉不该透传的响应头;
- 想手工删除响应头：`const res = await proxy(...); res.headers.delete('Set-Cookie'); return res`;
- 需要改写路径时先在 URL 层处理，`proxy()` 不做路径重写;

## `Connection` 头为什么默认被忽略？

- 逐跳头（Hop-by-Hop）只对单条连接有效，转发会引发注入风险;
- 默认忽略 `Connection` 是最安全的选择;
- 只在可信内网、且确实需要 RFC 9110 严格语义时开 `strictConnectionProcessing`;

```ts
app.get("/internal-proxy/:path", (c) =>
  proxy(`http://internal/${c.req.param("path")}`, {
    ...c.req,
    strictConnectionProcessing: true,
  }),
);
```

## 用 Accepts 做内容协商怎么写？

```ts
import { accepts } from "hono/accepts";

app.get("/", (c) => {
  const lang = accepts(c, {
    header: "Accept-Language",
    supports: ["en", "ja", "zh"],
    default: "en",
  });
  return c.json({ lang });
});
```

- 可选 header: `Accept`、`Accept-Encoding`、`Accept-Language`、`Accept-Charset` 等;
- 适合按语言返回文案，或按 `Accept` 返回 JSON/HTML;
- 返回值一定是 `supports` 里的某一项，兜底由 `default` 决定;
