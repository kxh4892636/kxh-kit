---
id: d2dbcb92-698d-4639-9c0f-9ed8ded0bac1
---

# Fetch

## fetch 的基本用法与配置项是什么？

- 语义: `XMLHttpRequest` 的现代化替代, 返回 Promise;

```js
fetch(input, init?); // input 为 URL 或 Request, init 为 RequestInit
```

- 常用 `RequestInit` 字段:

| 字段                          | 含义                         |
| ----------------------------- | ---------------------------- |
| `method`                      | HTTP 方法                    |
| `headers`                     | 请求头                       |
| `body`                        | 请求体                       |
| `mode`                        | 请求模式 (如 `no-cors`)      |
| `credentials`                 | 凭证配置                     |
| `cache`                       | 缓存策略                     |
| `redirect`                    | 重定向配置                   |
| `referrer` / `referrerPolicy` | Referer 设置与策略           |
| `integrity`                   | 子资源完整性校验             |
| `keepalive`                   | 允许请求存活超出页面生命周期 |
| `signal`                      | `AbortController` 的中断信号 |

## 什么情况下 fetch 的 Promise 会拒绝？

- 网络错误;
- 请求被中断;
- 超时;
- 注意: HTTP 状态码 4xx/5xx 不会导致拒绝, 需要检查 `response.ok`;

## 常见请求模式怎么写？

```js
fetch("/send-me-params", { method: "GET" }); // GET

// 表单编码
fetch("/send-me-params", {
  method: "POST",
  body: "foo=bar&baz=qux",
  headers: new Headers({ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }),
});

// JSON
fetch("/send-me-json", {
  method: "POST",
  body: JSON.stringify({ foo: "bar" }),
  headers: new Headers({ "Content-Type": "application/json" }),
});

// 文件
const formData = new FormData();
formData.append("image", imageInput.files[0]);
fetch("/img-upload", { method: "POST", body: formData });

// 跨源
fetch("//cross-origin.com", { method: "no-cors" });

// 中断
const abortController = new AbortController();
fetch("wikipedia.zip", { signal: abortController.signal });
setTimeout(() => abortController.abort());
```

## Headers 对象如何读写？

```js
const h = new Headers([["foo", "bar"]]);
h.set("foo", "baz"); // 覆盖
h.append("foo", "bar"); // 追加
h.has("foo"); // true
h.get("foo");
h.delete("foo");
[...h.entries()];
```

## 请求头有哪些不能设置的，Content-Type 默认值是什么？

- 设置: `headers` 选项传对象 (或 `Headers` 实例), 如 `{ Authentication: "secret" }`;
- 禁止设置: 由浏览器独占的安全头, 包括 `Accept-Charset`、`Accept-Encoding`、`Access-Control-Request-*`、`Connection`、`Content-Length`、`Cookie`、`Date`、`Host`、`Origin`、`Referer`、`Transfer-Encoding`、`Upgrade`、`Proxy-*`、`Sec-*` 等;
- `body` 默认类型: 字符串 → `text/plain;charset=UTF-8`; `Blob` → 取 `blob.type` (如 `image/png`), 无需手动设置;
- 发 JSON: 默认类型不对, 必须手动写 `"Content-Type": "application/json"`;
- `FormData`/`URLSearchParams` 的编码与 boundary 陷阱见 [FormData](./050-FormData.md);

## fetch 的 Promise 何时兑现，如何判断请求成功？

- 阶段一: 服务器返回响应头时即兑现, 此时可读 `status`/`headers`, 但还没有 body;
- 阶段二: 再调用一次 body 读取方法才拿到数据, 所以典型请求要两次 `await`;
- 拒绝条件: 只有网络层失败才拒绝, 4xx/5xx 照常兑现;

```js
const response = await fetch(url); // 等到响应头
if (response.ok) {
  // 200-299 时为 true
  const data = await response.json(); // 第二次 await 读 body
} else {
  showError(`HTTP-Error: ${response.status}`);
}
```

- 数值: `response.status` 是状态码, `response.ok` 是它的 200-299 布尔形式;
- 链式等价: `fetch(url).then((r) => r.json()).then(handle);`
- 其他格式: `response.text()` 取文本, `response.blob()` 取二进制, 完整方法表见 [Request 与 Response](./020-Request与Response.md);
- 只能选一种: body 被任一读取方法消费后, 其余方法会失败;

## 如何封装带超时与重试的 fetch？

- 思路: 每次尝试生成随机退避时长, 用 `AbortController` 到点中断, 失败则计数重试;
- `AbortController`: `new AbortController()` 给出 `signal`, 调用 `abort()` 即中断, 详见 [Fetch 进度、取消与请求选项](./090-Fetch进度与取消.md);

```js
const extendFetch = async (url, option, retry = 3) => {
  for (let num = 1; num <= retry; num++) {
    const timeout = (Math.floor(Math.random() * 2 ** num) + 1) * 1000;
    const ab = new AbortController();
    const id = setTimeout(() => ab.abort(), timeout);
    try {
      const res = await fetch(url, { ...option, signal: ab.signal });
      clearTimeout(id);
      return res;
    } catch {
      clearTimeout(id);
    }
  }
};
```

- 请求与响应对象的行为见 [Request 与 Response](./020-Request与Response.md);
