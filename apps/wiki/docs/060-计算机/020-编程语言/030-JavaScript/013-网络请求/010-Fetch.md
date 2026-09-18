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

## 如何封装带超时与重试的 fetch？

- 思路: 每次尝试生成随机退避时长, 用 `AbortController` 到点中断, 失败则计数重试;

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
