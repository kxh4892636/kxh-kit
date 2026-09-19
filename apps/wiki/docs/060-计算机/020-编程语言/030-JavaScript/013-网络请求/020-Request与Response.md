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

## fetch 的选项与 Request 属性如何对应？

- 关系: `fetch(input, init)` 中描述出站请求的字段, 与 `Request` 的属性同名同义;
- 上表未列出的选项与默认值:

| 选项             | 默认值                              | 含义摘要                     |
| ---------------- | ----------------------------------- | ---------------------------- |
| `referrer`       | `"about:client"`                    | 指定或清空 `Referer`         |
| `referrerPolicy` | `"strict-origin-when-cross-origin"` | `Referer` 发送规则           |
| `redirect`       | `"follow"`                          | 重定向处理方式               |
| `integrity`      | `""`                                | 响应校验和                   |
| `keepalive`      | `false`                             | 请求可活过页面卸载           |
| `signal`         | `undefined`                         | `AbortController` 的中断信号 |

- 取值语义与权衡: 见 [Fetch 进度、取消与请求选项](./090-Fetch进度与取消.md);
- 请求完成后拿到的是 `Response`, 状态判断与 body 读取见 [Fetch](./010-Fetch.md);

## Response 的状态信息由什么构成？

- 构造: `new Response(body, init)`, `init` 可指定 `status`、`statusText`、`headers`; 省略 `status` 时为 200;
- `status`: HTTP 状态码, 如 200 / 404 / 418;
- `ok`: 派生值, `status` 落在 200-299 时为 `true`, 不是可写字段;
- `headers`: Map 式响应头集合, 用 `get()` 取值, 可 `for...of` 遍历;
