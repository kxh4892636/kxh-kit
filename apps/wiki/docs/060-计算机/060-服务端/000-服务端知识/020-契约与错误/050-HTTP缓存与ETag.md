---
id: 627046a1-34a2-4c7f-ba2e-01c161b6af8c
anki: true
---

# HTTP 缓存与 ETag

## 强缓存与协商缓存有什么区别？

- 强缓存省掉请求（`Cache-Control: max-age`，不发请求）；协商缓存省掉 body（`ETag` + `If-None-Match`，命中返回 304）；纯 RPC 服务不适用;

- `no-cache` 不是「不缓存」，是「每次使用前必须回源校验」；不缓存用 `no-store`;
- 304 响应没有 body;
- ETag 要基于最终响应体计算，压缩前后不能混用。

## 带用户身份的响应为什么不能进共享缓存？

- 共享缓存不认识用户身份，缓存错响应会把 A 的数据发给 B;

- 带用户身份的响应必须 `private` 或 `no-store`;
- 缓存键默认是 URL，内容随请求头变化时必须加 `Vary`；缺失时缓存会把一个来源的响应复用给另一个。

## 缓存响应头具体怎么写？

```http
HTTP/1.1 200 OK
Cache-Control: private, max-age=0
ETag: "d3f1a9c"
Vary: Accept-Encoding, Origin

HTTP/1.1 304 Not Modified
ETag: "d3f1a9c"
```

```http
# 静态资源：文件名带内容哈希
Cache-Control: public, max-age=31536000, immutable

# 接口写操作
Cache-Control: no-store
```

- `ETag` 用响应体哈希（强校验）或弱校验 `W/`;
- 动态内容每次生成 ETag 有 CPU 成本，流量大时先测量;
- 反向代理已做压缩时，应用层 ETag 要基于压缩后的内容或关闭压缩，避免校验错位。

## HTTP 缓存策略按场景怎么选？

| 场景                   | 策略                                  |
| ---------------------- | ------------------------------------- |
| 静态资源、文件名带哈希 | `public, max-age=31536000, immutable` |
| 公共只读接口           | `public, max-age=60` + ETag           |
| 用户相关接口           | `private, max-age=0` + ETag           |
| 支付、订单、个人信息   | `no-store`                            |
| 需要实时一致           | `no-store` 或短 `max-age`             |

## 缓存配错会有哪些症状？

| 症状               | 原因                                 |
| ------------------ | ------------------------------------ |
| 用户看到别人的数据 | 用户相关响应被共享缓存               |
| 换域名后拿到旧响应 | 缺少 `Vary: Origin`                  |
| 静态资源更新不生效 | 文件名没变却用了长 `max-age`         |
| 304 后页面空白     | 客户端把 304 当完整响应处理          |
| 压缩与 ETag 不匹配 | ETag 基于压缩前内容，代理又改了 body |
