---
id: 1835b6cf-e449-44fa-8fe8-4f4c5311fe8d
---

# Fetch 进度、取消与请求选项

## 如何用 fetch 跟踪下载进度？

- 前提: fetch 没有进度事件, 只能绕过 `response.json()` 等方法, 直接读 `response.body` (一个 `ReadableStream`);
- 上传: fetch 无法跟踪上传进度, 只能改用 [XMLHttpRequest 与上传](./070-XMLHttpRequest与上传.md);
- 总量: 读取前用 `response.headers.get("Content-Length")` 取; 跨源时可能缺失, 服务端也可以不设置;

```js
const response = await fetch(url);
const reader = response.body.getReader(); // 取代 response.json()
const contentLength = +response.headers.get("Content-Length");

let receivedLength = 0;
const chunks = [];
while (true) {
  const { done, value } = await reader.read(); // value 是 Uint8Array
  if (done) break; // done 为 true 表示读完
  chunks.push(value);
  receivedLength += value.length;
  console.log(`Received ${receivedLength} of ${contentLength}`);
}
```

- `done` 为 `true` 表示读完, `value` 是本块字节 (`Uint8Array`);
- 未知长度: 必须给 `receivedLength` 设上限并主动退出, 否则 `chunks` 会撑爆内存;
- 兼容性: Streams API 另有 `for await...of` 迭代, 但浏览器支持不广, 故用 `while`;

## 读到的分块如何还原成文本或二进制？

- 拼接: 没有现成的合并方法, 先按总长建同类型数组, 再逐块 `set` 复制;
- 解码: 字节不是字符串, 用 `TextDecoder` 按 UTF-8 解释, 需要时再 `JSON.parse`;

```js
const chunksAll = new Uint8Array(receivedLength);
let position = 0;
for (const chunk of chunks) {
  chunksAll.set(chunk, position);
  position += chunk.length;
}
const text = new TextDecoder("utf-8").decode(chunksAll);
const commits = JSON.parse(text);
```

- 二进制: 直接用 `const blob = new Blob(chunks);` 取代拼接与解码两步;
- 提前留存: 读完之后 body 已被消费, 无法再调 `response.json()` 取数据, 只能自己拼; 一次性限制见 [Request 与 Response](./020-Request与Response.md);

## fetch 如何用 AbortController 取消请求？

- 背景: Promise 没有"取消"这一概念, 取消靠外挂一个信号对象;
- 对象: `new AbortController()` 只有方法 `abort()` 与属性 `signal`;
- 触发: 调用 `abort()` 时 `signal` 派发 `"abort"` 事件, 并把 `signal.aborted` 置为 `true`;
- 分工: 执行可取消操作的一方在 `signal` 上注册监听 (`signal.addEventListener("abort", fn)`), 需要取消的一方调用 `abort()`;
- 集成: 把 `signal` 作为 `fetch` 选项传入, `fetch` 会自动监听并中断该请求;

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 1000);

try {
  const response = await fetch("/hang", { signal: controller.signal });
} catch (err) {
  if (err.name === "AbortError")
    showMessage("Aborted!"); // 中断的专用错误名
  else throw err;
}
```

- 错误: 被中断的 fetch 以 `AbortError` 拒绝, 用 `err.name` 与普通网络错误区分;
- 通用性: `AbortController` 不绑定 fetch, 任何任务都能用同样的"触发事件 + 监听事件"模式取消;

## 一个 AbortController 能取消多个任务吗？

- 可以: 同一个 `signal` 传给多个请求, 一次 `abort()` 全部中断;
- 扩展: 自定义异步任务只要监听同一 `signal` 的 `abort` 事件, 就能与请求一起被取消;

```js
const controller = new AbortController();
const fetchJobs = urls.map((url) => fetch(url, { signal: controller.signal }));
const ourJob = new Promise((resolve, reject) => {
  controller.signal.addEventListener("abort", reject);
});
const results = await Promise.all([...fetchJobs, ourJob]); // 一起等待, 一起取消
```

- 超时中断的现成封装见 [Fetch](./010-Fetch.md);

## `referrer` 与 `referrerPolicy` 有什么区别？

- `referrer`: 直接指定 `Referer` 的值, 只能取空字符串 (不发) 或当前源内的 URL;
- `referrerPolicy`: 只给规则, 由浏览器按请求类型自动决定发什么;

| `referrerPolicy`                    | 同源   | 跨源   | HTTPS→HTTP |
| ----------------------------------- | ------ | ------ | ---------- |
| `"no-referrer"`                     | -      | -      | -          |
| `"no-referrer-when-downgrade"`      | full   | full   | -          |
| `"origin"`                          | origin | origin | origin     |
| `"origin-when-cross-origin"`        | full   | origin | origin     |
| `"same-origin"`                     | full   | -      | -          |
| `"strict-origin"`                   | origin | origin | -          |
| `"strict-origin-when-cross-origin"` | full   | origin | -          |
| `"unsafe-url"`                      | full   | full   | full       |

- 默认: `""` 等价于 `"strict-origin-when-cross-origin"`, 同源发完整 URL, 跨源只发源, HTTPS→HTTP 不发;
- 用途: 隐藏后台页面的路径时改用 `"origin-when-cross-origin"`, 跨源只暴露 `https://site.com`;
- 范围: 策略不限于 `fetch`, 也可用 `Referrer-Policy` 响应头或 `<a rel="noreferrer">` 全局设置;

## `mode` 与 `credentials` 如何限制跨源行为？

- `mode`: 跨源安全阀门 — `"cors"` (默认) 允许跨源请求, `"same-origin"` 禁止跨源请求, `"no-cors"` 只允许安全的跨源请求;
- `credentials`: 控制是否携带 Cookie 与 HTTP-Authorization 头;
  - `"same-origin"` (默认): 同源携带, 跨源不携带;
  - `"include"`: 总是携带, 跨源需服务端返回 `Access-Control-Allow-Credentials`;
  - `"omit"`: 从不携带, 同源也不带;
- `mode` 用途: URL 来自第三方时, 用它当作限制跨源能力的"断电开关";
- CORS、预检与带凭证请求的细节见 [跨源请求与 CORS](./060-跨源请求与CORS.md);

## `cache` 如何干预 HTTP 缓存？

- 默认: 走标准 HTTP 缓存, 尊重 `Expires`/`Cache-Control`, 会发 `If-Modified-Since` 等条件请求;
- `"no-store"`: 完全忽略缓存; 手动设置 `If-Modified-Since`、`If-None-Match`、`If-*` 等头时自动变为该模式;
- `"reload"`: 不读缓存, 但写入缓存; `"no-cache"`: 有缓存发条件请求, 否则发普通请求, 并更新缓存;
- `"force-cache"`: 优先用缓存, 即使过期; 未命中才走网络;
- `"only-if-cached"`: 只允许缓存命中, 未命中直接报错, 且仅在 `mode: "same-origin"` 下有效;

## `redirect`、`integrity`、`keepalive` 各解决什么问题？

- `redirect`: `"follow"` (默认) 自动跟随 3xx; `"error"` 遇重定向报错; `"manual"` 手动处理, 得到 `response.type === "opaqueredirect"` 且状态等属性被清空的响应;
- `integrity`: 预先声明校验和 (如 `fetch(url, { integrity: "sha256-abcdef" })`), fetch 自行计算并比对, 不匹配即报错; 支持 SHA-256/384/512, 浏览器可能支持更多;
- `keepalive`: 让请求"活过"页面卸载; 默认文档卸载会中断所有关联请求, 该选项让请求转后台继续;

```js
window.onunload = function () {
  fetch("/analytics", { method: "POST", body: "statistics", keepalive: true });
};
```

- 体积限制: 所有 keepalive 请求的 body 合计不超过 64KB, 数据多要分批定期上报;
- 响应限制: 页面卸载后无法处理响应, 统计类请求通常只回空响应, 无影响;
- 对照: 同一场景也可用 [Beacon](./040-Beacon.md);
