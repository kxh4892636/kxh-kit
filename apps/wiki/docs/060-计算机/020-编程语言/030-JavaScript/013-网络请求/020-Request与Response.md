---
id: 03400d62-448e-43e0-96f8-bcdfba54caab
---

# Request 与 Response

## Request 对象如何创建与描述请求？

```js
const r2 = new Request("https://foo.com", { method: "POST" });
```

| 属性          | 含义     |
| ------------- | -------- |
| `method`      | 请求方法 |
| `url`         | 请求 URL |
| `headers`     | 请求头   |
| `body`        | 请求体   |
| `mode`        | 请求模式 |
| `credentials` | 凭证配置 |
| `cache`       | 缓存策略 |

## Request 与 Response 如何克隆？

- `new Request(r)` / `new Response(res)`: 克隆后原对象的请求体被标记为已使用;
- `r.clone()` / `res.clone()`: 原对象不受影响;
- 一次性: `Request` 与 `Response` 的 body 只能被消费一次, 用过后不能再克隆或读取;

```js
const r = new Response("foobar", { status: 418, statusText: "I'm a teapot" });
```

## Body 混入提供哪些读取方法？

- 共性: `Request` 与 `Response` 都混入 Body, 拥有只读的 `body` 与 `bodyUsed`;
- 转换: 先读取 `ReadableStream` 到缓冲区, 再按类型解析;

| 方法            | 返回类型               |
| --------------- | ---------------------- |
| `text()`        | `Promise<string>`      |
| `json()`        | `Promise<any>`         |
| `blob()`        | `Promise<Blob>`        |
| `arrayBuffer()` | `Promise<ArrayBuffer>` |
| `formData()`    | `Promise<FormData>`    |

```js
const res = await fetch("/api");
const data = await res.json(); // 之后 res.bodyUsed 为 true
```

- 一次性流: 所有读取方法只能调用一次;
