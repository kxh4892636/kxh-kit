---
id: 77e3460e-5496-4822-8f11-b5ab859d0430
---

# XMLHttpRequest 与上传

## 什么时候还值得用 XMLHttpRequest？

- 现代替代: `fetch` 覆盖了多数场景, 基本已取代它, 见 [Fetch](./010-Fetch.md);
- 三个理由: 维护已有老脚本; 支持老浏览器且不想引 polyfill; 需要 `fetch` 还没有的能力, 典型是上传进度;
- 名称无关: 名字里的 XML 只是历史, 可处理任意数据, 也能传文件;

## 一次异步请求的生命周期是怎样的？

```js
const xhr = new XMLHttpRequest();
xhr.open("GET", "/load"); // 只做配置, 不建立连接
xhr.send(); // 此刻才发起网络活动
xhr.onload = () => console.log(xhr.status, xhr.response);
```

- `open(method, URL, async, user, password)`: `async` 显式传 `false` 才是同步; `user`/`password` 用于 Basic 认证; `URL` 可用 `URL` 对象自动编码查询参数;
- `send(body)`: 可选请求体, `GET` 等方法没有 body;

- `status`: HTTP 状态码, 非 HTTP 失败时为 `0`;
- `statusText`: 状态消息, 如 `OK`、`Not Found`;
- `response`: 响应体, 格式由 `responseType` 决定 (见下文);

| 事件        | 触发时机                                                 |
| ----------- | -------------------------------------------------------- |
| `loadstart` | 请求开始                                                 |
| `progress`  | 下载中周期触发, 带 `loaded`、`lengthComputable`、`total` |
| `abort`     | 调用 `xhr.abort()` 取消, 之后 `status` 为 `0`            |
| `error`     | 连接级错误, 如域名不存在; 4xx/5xx 不算                   |
| `load`      | 完成且响应下载完毕 (HTTP 400/500 也会触发)               |
| `timeout`   | 超时被取消, 需先设 `xhr.timeout = 10000` (毫秒)          |
| `loadend`   | 上述任一结束后都会触发                                   |

- 互斥: `error`、`abort`、`timeout`、`load` 只会发生其中一个; 习惯用 `load`/`error` 分别处理, 或只挂 `loadend` 再检查 `xhr` 属性;
- `readyState` (0 UNSENT → 1 OPENED → 2 HEADERS_RECEIVED → 3 LOADING → 4 DONE) 与 `readystatechange` 属历史写法, 已被上面的新事件取代;
- 跨源: 与 `fetch` 同一套 CORS 策略, 凭证需 `xhr.withCredentials = true`, 见 [跨源请求与 CORS](./060-跨源请求与CORS.md);

## 同步请求为什么几乎不用？

- 行为: `open` 第三参传 `false` 时, JS 在 `send()` 处阻塞到响应到达, 类似 `alert`;
- 代价: 阻塞整个页面脚本, 某些浏览器连滚动都失效, 耗时过久会被提示关闭页面;
- 能力缺失: 跨源、`timeout`、进度指示在同步模式下都不可用;
- 结论: 极少使用, 默认永远异步;

## `responseType` 如何决定响应格式？

| 取值                    | `xhr.response` 类型        |
| ----------------------- | -------------------------- |
| `""` (默认) 或 `"text"` | 字符串                     |
| `"arraybuffer"`         | `ArrayBuffer`              |
| `"blob"`                | `Blob`                     |
| `"document"`            | XML 或 HTML 文档           |
| `"json"`                | 自动 `JSON.parse` 后的对象 |

- 旧脚本里的 `responseText` / `responseXML` 属历史遗留, 新代码统一用 `responseType` + `response`;

## 请求头与响应头如何读写？

| 方法                            | 作用         |
| ------------------------------- | ------------ |
| `setRequestHeader(name, value)` | 设置请求头   |
| `getResponseHeader(name)`       | 读单个响应头 |
| `getAllResponseHeaders()`       | 读全部响应头 |

- 浏览器专属头: `Referer`、`Host` 等由浏览器管理, 脚本不能改;
- 只增不减: `setRequestHeader` 无法撤销也无法覆盖, 同名两次调用得到 `X-Auth: 123, 456`;
- 读不到: `Set-Cookie` 与 `Set-Cookie2` 被排除;
- 格式固定: 头之间换行固定为 `"\r\n"` (与系统无关), 名值分隔固定为 `": "`, 因此可自行切分成分组对象;

## `send()` 能发送哪些请求体？

- `FormData`: 自动按 `multipart/form-data` 编码, 字段与文件写法见 [FormData](./050-FormData.md);
- JSON 字符串: `JSON.stringify` 后发送, 务必设 `Content-Type: application/json`, 多数服务端框架据此自动解码;
- `Blob` / `BufferSource`: 裸二进制, 见 [二进制数据与 Blob](../017-浏览器API/020-二进制数据与Blob.md);

```js
xhr.open("POST", "/submit");
xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
xhr.send(JSON.stringify({ name: "John" }));
```

## 如何跟踪上传进度？

- 关键: `progress` 只在下载阶段触发; 上传要先发 body 再收响应, 必须换对象;
- `xhr.upload`: 无方法的特殊对象, 事件名同 `xhr`, 但只在**上传**阶段触发;
- 可用事件: `loadstart`、`progress`、`abort`、`error`、`load`、`timeout`、`loadend`;

```js
xhr.upload.onprogress = (e) => console.log(`Uploaded ${e.loaded} of ${e.total}`);
xhr.upload.onerror = () => console.log(`Error during upload: ${xhr.status}`);
xhr.onloadend = () => console.log(xhr.status === 200 ? "success" : "error"); // 成功或失败都走这里
xhr.open("POST", "/upload");
xhr.send(file); // file 可来自 input.files[0]
```

## 上传进度为什么不足以做断点续传？

- `xhr.upload.onprogress` 只说明数据**已发出**, 不说明服务端**已收到**;
- 失真来源: 被本地网络代理缓冲、服务端进程中途死掉、传输中丢包;
- 因此它只能用来画进度条; 续传要的是服务端确认的精确已收字节数, 只能额外发一个查询请求去问;

## 断点续传的算法是什么？

- 文件指纹: `fileId = file.name + "-" + file.size + "-" + file.lastModified`; 名称、大小、修改时间任一变化就是另一个文件;
- ① 问服务端已有多少字节:

```js
const fileId = `${file.name}-${file.size}-${file.lastModified}`;
const res = await fetch("status", { headers: { "X-File-Id": fileId } });
const startByte = +(await res.text()); // 服务端没有该文件时返回 0
```

- ② 从 `startByte` 处续传:

```js
const xhr = new XMLHttpRequest();
xhr.open("POST", "upload");
xhr.setRequestHeader("X-File-Id", fileId); // 服务端据此定位是哪个文件
xhr.setRequestHeader("X-Start-Byte", startByte); // 声明这不是首次上传, 而是续传
xhr.upload.onprogress = (e) =>
  console.log(`Uploaded ${startByte + e.loaded} of ${startByte + e.total}`);
xhr.send(file.slice(startByte)); // Blob.slice 切出剩余部分
```

- 服务端契约: 按 `X-File-Id` 记录进度; 若已收字节恰好等于 `X-Start-Byte` 就追加数据, 否则拒绝;
- 进度换算: `onprogress` 的 `loaded` 只覆盖本次分片, 总量要加上 `startByte` 才是真实进度;

## 分片并发上传如何组织？

- 切分: `file.slice(start, end)` 得到独立 `Blob` 分片, 每片一个 `xhr`;
- 标识: 每片带 `X-File-Id` 与自身偏移, 服务端按偏移写入同一临时文件, 到达顺序可以乱;
- 并发度: 限制同时在飞的请求数, 避免占满带宽与连接池;
- 进度: 累加各分片 `upload.onprogress` 的 `loaded` 再除以 `file.size`;
- 重试: 某片失败只重发该片, 由偏移保证幂等;
- 完整性校验与合并策略见 [二进制数据与 Blob](../017-浏览器API/020-二进制数据与Blob.md);
