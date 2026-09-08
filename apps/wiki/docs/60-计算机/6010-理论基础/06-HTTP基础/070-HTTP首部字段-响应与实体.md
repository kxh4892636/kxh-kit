---
id: 6ce34c21-e6a7-43a9-b1ac-6db09d0d7c0b
---

# HTTP 首部字段：响应与实体

## 响应首部字段回答的是什么问题?

- 响应首部字段: 只出现在响应报文里的首部，由服务器写给客户端，说明这次响应本身还能怎么被使用; 它不描述资源内容，只描述这次响应的处理信息;

| 首部字段             | 回答的问题                             | 示例                                                              |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `Accept-Ranges`      | 服务器能否处理范围请求                 | `Accept-Ranges: bytes` 表示可以，`Accept-Ranges: none` 表示不可以 |
| `Age`                | 源服务器创建这个响应至今过了多久（秒） | `Age: 600`                                                        |
| `ETag`               | 这份资源的唯一标识是什么               | `ETag: "82e22293907ce725faf67773957acd12"`                        |
| `Location`           | 客户端该去访问哪个 URL                 | `Location: http://www.usagidesign.jp/sample.html`                 |
| `Proxy-Authenticate` | 代理服务器要求什么认证信息             | `Proxy-Authenticate: Basic realm="Usagidesign Auth"`              |
| `Retry-After`        | 客户端什么时候可以再来访问             | `Retry-After: 120`                                                |
| `Server`             | 服务器端 Web 服务器信息                | `Server: Apache/2.2.6 (Unix) PHP/5.2.5`                           |
| `Vary`               | 缓存要按哪些请求首部区分副本           | `Vary: Accept-Language`                                           |

- `Location` 的用法: 引导客户端访问指定 URL，常用于 3XX 状态码;
- `Retry-After` 的用法: 告知客户端访问时间，常与 3XX 和 503 状态码一起使用;
- `Age` 的用法: 表示源服务器创建响应的时间（秒），常作用于缓存服务器，用来查询缓存验证时间;
- `Proxy-Authenticate` 的用法: 发送代理服务器要求的认证信息;
- `Server` 的用法: 暴露服务器端 Web 服务器的信息，如软件名与版本;
- `ETag` 的用法: 给资源一个唯一标识，用于判断两份内容是不是同一个版本;

## Vary 如何决定缓存能不能复用?

- Vary 的作用: 对缓存进行控制，缓存服务器仅对 Vary 首部字段相同的请求使用缓存;
- 通俗解释: 同一个 URL 对不同客户端可能返回不同内容，Vary 就是声明"按哪个请求首部来区分这些内容";
- 示例: `Vary: Accept-Language` 表示只能对持相同自然语言（`Accept-Language`）的请求返回缓存;
- 代价: 同一资源按 Vary 声明的字段被拆成多份缓存副本，字段取值越分散，缓存越难命中;

![Vary](../images/2024-01-19-16-41-48.png)

## 实体首部字段描述主体的哪些属性?

- 实体首部字段: 描述报文实体（报文主体）本身的首部; 它们回答"主体是什么、有多大、怎么编码的、什么时候失效";

| 首部字段           | 描述的内容                       | 示例                                                    |
| ------------------ | -------------------------------- | ------------------------------------------------------- |
| `Allow`            | 资源支持的 HTTP 方法             | `Allow: GET, HEAD`                                      |
| `Content-Encoding` | 实体主体部分的内容编码           | `Content-Encoding: gzip`                                |
| `Content-Language` | 实体主体部分使用的自然语言       | `Content-Language: zh-CN`                               |
| `Content-Length`   | 实体主体部分的字节长度           | `Content-Length: 15000`                                 |
| `Content-Location` | 实体主体部分对应的 URL           | 不同于 `Location` 字段                                  |
| `Content-MD5`      | 实体主体部分的 MD5               | `Content-MD5: OGFkZDUwNGVhNGY3N2MxMDIwZmQ4NTBmY2IyTY==` |
| `Content-Range`    | 发送部分和总体长度，用于范围请求 | `Content-Range: bytes 5001-10000/10000`                 |
| `Content-Type`     | 实体主体的 MIME 类型和字符集     | `Content-Type: text/html; charset=UTF-8`                |
| `Expires`          | 实体失效时间                     | `Expires: Wed, 04 Jul 2012 08:26:05 GMT`                |
| `Last-Modified`    | 对应资源最后被修改的时间         | `Last-Modified: Wed, 23 May 2012 09:59:55 GMT`          |

## 缓存与内容校验靠哪些实体首部字段配合?

- `Expires`: 超过指定时间后重新向源服务器请求，决定这份副本还能不能继续用;
- `Last-Modified`: 给出对应资源最后被修改的时间，是"资源什么时候变过"的时间点;
- `Content-MD5`: 给出实体主体部分的 MD5，用于校验主体内容;
- `Content-Range`: 用于范围请求，表示发送部分和总体长度;
- 分工: `ETag` 标识资源版本，`Expires` 与 `Last-Modified` 记录时间，三者共同支撑缓存的复用判断;

```bash
# 响应里同时给出资源标识、失效时间与修改时间
ETag: "82e22293907ce725faf67773957acd12"
Expires: Wed, 04 Jul 2012 08:26:05 GMT
Last-Modified: Wed, 23 May 2012 09:59:55 GMT
```

## Cookie 与其他扩展首部字段分别管什么?

- `Set-Cookie`: 服务器通知客户端设置 cookie 为指定值，例如 `Set-Cookie: status=enable; expires=Tue, 05 Jul 2011 07:26:31 GMT; path=/; domain=.hackr.jp;`;
- `Cookie`: 请求中客户端的 cookie 信息，例如 `Cookie: status=enable`;
- `X-Frame-Options`: Frame 标签的权限管理，`DENY` 拒绝其他页面访问，`SAMEORIGIN` 仅允许同源页面范围;
- `X-XSS-Protection`: 控制浏览器 XSS 防护机制，例如 `X-XSS-Protection: 1`;
- `DNT`: 拒绝个人信息被收集，例如 `DNT: 1`;
- `P3P`: 将个人隐私信息转换仅程序可读的形式，用于保护用户隐私;
