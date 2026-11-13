---
id: 5fce701d-227a-41ba-8b78-ecba0a91b29c
---

# 跨源请求与 CORS

## 什么算跨源请求, 为什么需要 CORS？

- 源 (origin): 协议 + 域名 + 端口的组合;
- 跨源: 三者任一不同, 子域名也算跨源;
- 现状: 跨源 `fetch` 默认失败, 除非远端显式返回允许头;
- 机制: CORS (Cross-Origin Resource Sharing), 跨源资源共享;
- 目的: 脚本读不到别的源的数据, 例如 `hacker.com` 的脚本读不了 `gmail.com` 的邮箱;

历史绕行手段:

- `<form target="iframe">`: 能向任意站点发 GET/POST, 但读不到 iframe 内的响应;
- `<script src>`: 能执行任意源的脚本, 于是有 JSONP —— 用 `?callback=gotWeather` 让服务端返回 `gotWeather({...})`; 双方事先约定, 不算越权;
- 遗留影响: 老服务可能把非标准方法当作"非浏览器"的特权信号, 所以浏览器发非简单请求前要先预检;

## 简单请求与预检请求的分界线在哪？

| 条件     | 简单请求允许的值                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 方法     | `GET` / `POST` / `HEAD`                                                                                                                      |
| 自定义头 | `Accept`、`Accept-Language`、`Content-Language`、`Content-Type` = `application/x-www-form-urlencoded` / `multipart/form-data` / `text/plain` |

- 判定: 任一条件不满足即为非简单请求, 如 `PUT`、`DELETE`、`API-Key` 头、`Content-Type: application/json`;
- 分界理由: 简单请求用 `<form>` 或 `<script>` 在远古浏览器就能发出, 老服务必须能接;
- 处理差异: 简单请求直接发; 非简单请求先发 `OPTIONS` 预检, 未获允许就根本不发;

## 简单请求的 CORS 流程是什么？

```http
GET /request
Host: anywhere.com
Origin: https://javascript.info
```

```http
200 OK
Access-Control-Allow-Origin: https://javascript.info
```

- 浏览器: 跨源请求总是自动带上 `Origin`, 值只有协议+域名+端口, 不含路径;
- 服务端: 同意就回 `Access-Control-Allow-Origin`, 值为该源或 `*`;
- 浏览器作为可信中介: 校验响应里的允许头, 通过才把响应交给 JS, 否则报错;
- 响应头白名单: 默认仅 `Cache-Control`、`Content-Language`、`Content-Length`、`Content-Type`、`Expires`、`Last-Modified`、`Pragma` 可读;
- 放开其他头: 服务端列出 `Access-Control-Expose-Headers: Content-Encoding,API-Key`;
- 注意: 被读取白名单外的响应头会直接报错;

## 预检请求如何一步步完成？

以跨源 `PATCH https://site.com/service.json` (`Content-Type: application/json` + `API-Key`) 为例, 三条都算非简单:

```http
OPTIONS /service.json
Origin: https://javascript.info
Access-Control-Request-Method: PATCH
Access-Control-Request-Headers: Content-Type,API-Key
```

```http
200 OK
Access-Control-Allow-Origin: https://javascript.info
Access-Control-Allow-Methods: PUT,PATCH,DELETE
Access-Control-Allow-Headers: API-Key,Content-Type,If-Modified-Since,Cache-Control
Access-Control-Max-Age: 86400
```

- 预检特征: 方法 `OPTIONS`、路径与主请求完全相同、无 body;
- 服务端要求: 状态 200, 且被请求的方法与头都出现在 `Allow-Methods` / `Allow-Headers` 列表中, 否则报错;
- `Access-Control-Max-Age`: 权限缓存秒数, 期内同条件的后续请求跳过预检直接发;
- 第 3 步: 预检通过后才发主请求, 主请求同样带 `Origin`;
- 第 4 步: 主响应仍必须带 `Access-Control-Allow-Origin`, 预检成功不能免除;
- 透明性: 预检对 JS 不可见, JS 只能拿到主响应或一个错误;

## 带凭证的跨源请求为什么默认被剥离？

- 默认: JS 发起的跨源请求不带 cookie 与 HTTP 认证信息, 连属于目标域的 cookie 也不带, 这是 HTTP 惯例的例外;
- 原因: 带凭证等于以用户身份行事, 能读敏感信息, 必须由服务端显式授权;
- 客户端: `fetch(url, { credentials: "include" })` 才会带上目标域的 cookie;
- 服务端: 除 `Access-Control-Allow-Origin` 外还要回 `Access-Control-Allow-Credentials: true`;
- 硬约束: 带凭证时 `Access-Control-Allow-Origin` 禁止写 `*`, 必须是与 `Origin` 完全相同的值;
- XHR 对应开关: `xhr.withCredentials = true`, 见 [XMLHttpRequest 与上传](./070-XMLHttpRequest与上传.md);
- cookie 的 `SameSite`、`Secure` 等属性见 [cookie](../014-客户端存储/010-cookie.md);

## `mode: "no-cors"` 与不透明响应是什么？

- 语义: 主动放弃 CORS 放行, 请求降级为"只能发, 不能读";
- 限制: 方法只能是简单方法, 头只能是简单头, 且不带凭证;
- 结果: 得到 `type` 为 `opaque` 的响应, `status` 为 0, body 与响应头全部不可读;
- 用途: `<img>`、`<script>` 式的旁路请求 (埋点、加载资源), 不是取数据;
- 对比: 普通跨源请求只有两种结局 —— 拿到可读响应, 或直接失败;

## CORS 报错该如何排查？

- 看网络面板: 是否存在 `OPTIONS` 预检, 以及预检响应头内容;
- 逐项比对: 方法在 `Access-Control-Allow-Methods` 里吗; 自定义头在 `Access-Control-Allow-Headers` 里吗; `Origin` 与 `Access-Control-Allow-Origin` 完全一致或后者为 `*` 吗;
- 带凭证: 必须 `Access-Control-Allow-Credentials: true`, 且不允许 `*`;
- 要读的响应头: 必须列入 `Access-Control-Expose-Headers`;
- 错误响应也要带头: 服务端 500/404 响应缺 CORS 头时, 浏览器同样报网络级错误, JS 看不到状态码;
- 缓存干扰: 预检结果被 `Access-Control-Max-Age` 缓存, 改完服务端配置后旧结果可能仍在生效;
- 定位方向: 这类报错通常要在服务端修, 前端改不动;
