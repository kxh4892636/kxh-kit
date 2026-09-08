---
id: ecae86f7-5b81-4aba-8231-7f881c5c24c2
---

# HTTP 首部字段：请求

## 请求首部字段里客户端在表达什么?

| 首部字段              | 含义                                                                                                                       | 示例                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Accept`              | 客户端支持的多媒体类型和优先级; 优先返回优先级高的类型，权重值 `q` 取 0-1、默认为 1，多个值用 `;` 分隔，`*/*` 表示任何类型 | `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`                |
| `Accept-Charset`      | 客户端支持的字符集和优先级                                                                                                 | `Accept-Charset: iso-8859-5, unicode-1-1;q=0.8`                                          |
| `Accept-Encoding`     | 客户端支持的内容编码类型和优先级                                                                                           | `Accept-Encoding: gzip, deflate`                                                         |
| `Accept-Language`     | 客户端支持的自然语言集和优先级                                                                                             | `Accept-Language: zh-cn,zh;q=0.7,en-us,en;q=0.3`                                         |
| `Authorization`       | 客户端认证信息，用于 401 状态码响应                                                                                        | `Authorization: Basic dWVub3NlbjpwYXNzd29yZA==`                                          |
| `Expect`              | 客户端期待出现的行为                                                                                                       | `Expect: 100-continue`                                                                   |
| `From`                | 客户端邮箱地址                                                                                                             | `From: info@hackr.jp`                                                                    |
| `Host`                | 指明服务器端 URL，必须使用                                                                                                 | `Host: www.hackr.jp`                                                                     |
| `Max-Forwards`        | 最大转发次数，作用于 TRACE 和 OPTIONS 方法                                                                                 | `Max-Forwards: 10`                                                                       |
| `Proxy-Authorization` | 同 `Authorization`                                                                                                         | `Proxy-Authorization: Basic dGlwOjkpNLAGfFY5`                                            |
| `Range`               | 设置范围请求中响应报文主体的范围，返回 206 或 200                                                                          | `Range: bytes=5001-10000`                                                                |
| `Referer`             | 设置发起请求报文的 URL                                                                                                     | `Referer: http://www.hackr.jp/index.htm`                                                 |
| `TE`                  | 等效 `Accept-Encoding`，但作用于传输编码而非内容编码                                                                       | `TE: gzip, deflate;q=0.5`                                                                |
| `User-Agent`          | 浏览器种类                                                                                                                 | `User-Agent: Mozilla/5.0 (Windows NT 6.1; WOW64; rv:13.0) Gecko/20100101 Firefox/13.0.1` |

## 条件请求字段如何决定返回 200 还是 412?

| 首部字段              | 条件与结果                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `If-Match`            | 服务器资源的 ETag 值对应时返回 200，反之返回 412                                                           |
| `If-None-Match`       | `If-Match` 取反; ETag 值不对应时返回 200，反之返回 412                                                     |
| `If-Modified-Since`   | 判断资源是否在对应时间后发生更新; 若为假，即 `Last-Modified` 早于对应值，返回 304，反之返回 200 的最新副本 |
| `If-Unmodified-Since` | `If-Modified-Since` 取反; 若更新返回 412，反之返回 200                                                     |
| `If-Range`            | 资源的 ETag 值对应时按范围请求处理，反之返回 412                                                           |
