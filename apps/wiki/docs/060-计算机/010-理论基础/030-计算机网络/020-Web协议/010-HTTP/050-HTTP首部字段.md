---
id: 4cbd7a30-8e12-4f4a-b5f2-24453deb0609
---

# HTTP 首部字段

## 首部字段的结构与分类是什么？

- 结构: `字段名: 字段值`;
- 按作用范围分四类:
  - 通用首部字段: 请求报文与响应报文都能用;
  - 请求首部字段: 只出现在请求报文;
  - 响应首部字段: 只出现在响应报文;
  - 实体首部字段: 描述报文主体;
- 按来源分: HTTP/1.1 协议字段 (RFC2616) 与非 HTTP 协议字段 (RFC4229);

## 端到端首部与逐跳首部有什么区别？

- 端到端首部 (End-to-end Header): 必须转发给最终接收目标;
- 逐跳首部 (Hop-by-hop Header): 只对单次转发有效, 代理不再转发;
- 逐跳首部固定为: `Connection`、`Keep-Alive`、`Proxy-Authenticate`、`Proxy-Authorization`、`Trailer`、`TE`、`Transfer-Encoding`、`Upgrade`;

## 通用首部字段有哪些？

| 字段                | 作用                                                 |
| ------------------- | ---------------------------------------------------- |
| `Cache-Control`     | 控制缓存行为                                         |
| `Connection`        | 控制不再转发的字段名, 或管理持久连接                 |
| `Date`              | 报文的创建时间                                       |
| `Pragma`            | HTTP 遗留字段, 等效 `Cache-Control: no-cache`        |
| `Trailer`           | 声明报文主体中出现的首部字段                         |
| `Transfer-Encoding` | 报文主体的传输编码方式, 如 `chunked`                 |
| `Upgrade`           | 检测能否使用更高版本的协议, 与 `Connection` 协同使用 |
| `Via`               | 记录请求经过的代理传输路径                           |
| `Warning`           | 记录缓存相关的警告                                   |

## Cache-Control 的常用指令怎么选？

| 指令                                   | 含义                             |
| -------------------------------------- | -------------------------------- |
| `public`                               | 响应可被浏览器与代理服务器缓存   |
| `private`                              | 响应只可被浏览器缓存             |
| `no-cache`                             | 跳过强缓存, 进入协商缓存         |
| `no-store`                             | 完全不使用缓存                   |
| `max-age=n`                            | 缓存最长生效时间(秒)             |
| `min-fresh=n`                          | 缓存至少还需保持有效 n 秒        |
| `max-stale=n`                          | 过期不超过 n 秒的缓存仍可接受    |
| `only-if-cached`                       | 仅在已有缓存时返回               |
| `must-revalidate` / `proxy-revalidate` | 过期后必须向源服务器验证         |
| `no-transform`                         | 禁止代理改变实体主体的 MIME 类型 |

```bash
Cache-Control: public, max-age=86400
```
