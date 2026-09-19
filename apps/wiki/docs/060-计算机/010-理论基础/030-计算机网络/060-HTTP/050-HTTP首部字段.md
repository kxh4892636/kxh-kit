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

## 请求首部字段有哪些？

| 字段                  | 作用                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `Accept`              | 客户端支持的媒体类型与优先级, `q` 取值 0~1 默认 1, `*/*` 表示任意类型 |
| `Accept-Charset`      | 支持的字符集与优先级                                                  |
| `Accept-Encoding`     | 支持的内容编码与优先级, 如 `gzip, deflate`                            |
| `Accept-Language`     | 支持的自然语言与优先级                                                |
| `Authorization`       | 客户端认证信息, 用于 401 之后重发                                     |
| `Expect`              | 期待服务端出现的行为, 如 `100-continue`                               |
| `From`                | 客户端邮箱地址                                                        |
| `Host`                | 目标服务器 URL, 必须携带                                              |
| `Max-Forwards`        | 最大转发次数, 作用于 `TRACE` 与 `OPTIONS`                             |
| `Proxy-Authorization` | 对代理服务器的认证信息                                                |
| `Range`               | 请求的字节范围, 如 `bytes=5001-10000`                                 |
| `Referer`             | 发起请求的页面 URL                                                    |
| `TE`                  | 可接受的传输编码, 作用在传输编码而非内容编码                          |
| `User-Agent`          | 浏览器与客户端种类                                                    |
| `Cookie`              | 客户端保存并回传的状态信息                                            |

## 响应首部字段有哪些？

| 字段                 | 作用                                           |
| -------------------- | ---------------------------------------------- |
| `Accept-Ranges`      | 服务器能否处理范围请求, 取值 `bytes` 或 `none` |
| `Age`                | 响应在缓存中已存活的秒数                       |
| `ETag`               | 资源唯一标识, 用于协商缓存                     |
| `Location`           | 引导客户端访问的 URL, 常配 3XX                 |
| `Proxy-Authenticate` | 代理要求的认证信息                             |
| `Retry-After`        | 建议客户端重试的等待时间, 常配 3XX 与 503      |
| `Server`             | 服务端 Web 服务器信息                          |
| `Vary`               | 缓存判定字段, 仅该字段相同的请求才复用缓存     |
| `Set-Cookie`         | 通知客户端保存状态信息                         |

![Vary](../images/2024-01-19-16-41-48.png)

## 实体首部字段有哪些？

| 字段               | 作用                                                |
| ------------------ | --------------------------------------------------- |
| `Allow`            | 资源支持的 HTTP 方法                                |
| `Content-Encoding` | 主体使用的内容编码, 如 `gzip`                       |
| `Content-Language` | 主体使用的自然语言                                  |
| `Content-Length`   | 主体的字节长度                                      |
| `Content-Location` | 主体对应的 URL, 与 `Location` 不同                  |
| `Content-MD5`      | 主体的 MD5 摘要                                     |
| `Content-Range`    | 主体在完整资源中的范围, 如 `bytes 5001-10000/10000` |
| `Content-Type`     | 主体的 MIME 类型与字符集                            |
| `Expires`          | 实体失效时间, HTTP/1.0 的强缓存字段                 |
| `Last-Modified`    | 资源最后被修改的时间                                |
