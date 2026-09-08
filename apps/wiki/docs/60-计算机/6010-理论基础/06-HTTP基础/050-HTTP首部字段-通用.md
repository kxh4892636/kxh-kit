---
id: aa27e1f8-4a2c-48b2-ad9d-ab7664810e4a
---

# HTTP 首部字段：通用

## 首部字段长什么样、分成哪几类?

- 字段结构: 一行一个字段，写成 `首部字段名: 字段值`;
- 通用首部字段: 请求报文和响应报文都可以用;
- 请求首部字段: 仅用于请求报文;
- 响应首部字段: 仅用于响应报文;
- 实体首部字段: 描述报文实体;
- 字段来源: 一类是 HTTP/1.1 协议（RFC 2616）定义的字段，另一类来自非 HTTP 协议（RFC 4229）;

## 逐跳首部为什么不能原样转发到终点?

- 端到端首部（End-to-end Header）: 必须被转发给最终接受目标的首部; 它描述的是两端之间的事，中间节点只管照传;
- 逐跳首部（Hop-by-hop Header）: 只需转发单次的首部; 它描述的是"这一跳"的连接状态，让下一跳继续带着没有意义;
- 八项逐跳首部: `Connection`、`Keep-Alive`、`Proxy-Authenticate`、`Proxy-Authorization`、`Trailer`、`TE`、`Transfer-Encoding`、`Upgrade`;

## Cache-Control 能下哪些缓存指令?

- `Cache-Control`: 控制缓存行为; 可以一次写多个指令，例如 `Cache-Control: private, max-age=0, no-cache`;

```text
Cache-Control: private, max-age=0, no-cache
```

| 指令               | 含义                                       |
| ------------------ | ------------------------------------------ |
| `public`           | 所有用户可缓存                             |
| `private`          | 特定用户缓存                               |
| `no-cache`         | 使用缓存，但不使用缓存过期的资源           |
| `no-store`         | 不进行缓存                                 |
| `max-age=604800`   | 缓存最大生效时间                           |
| `min-fresh=60`     | 缓存最小生效时间                           |
| `max-stale=3600`   | 缓存最大过期时间，只要小于对应数值，都接受 |
| `only-if-cached`   | 仅在具有缓存的情况下返回                   |
| `must-revalidate`  | 缓存服务器必须验证资源是否有效             |
| `proxy-revalidate` | 缓存服务器必须验证资源是否有效             |
| `no-transform`     | 禁止改变实体主体 MIME 类型                 |

## 通用首部字段里其余字段各自做什么?

- `Connection`: 控制不再转发的首部字段，也管理持久连接;
- `Date`: 表示 HTTP 报文的创建时间;
- `Pragma`: HTTP 遗留字段，等效 `Cache-Control: no-cache`;
- `Trailer`: 记录报文主体中的首部字段;
- `Transfer-Encoding`: 传输报文主体使用的编码方式;
- `Upgrade`: 检测能否使用更高版本的协议，与 `Connection` 协同使用;
- `Via`: 记录请求的传输路径;
- `Warning`: 记录缓存相关的警告;

```text
Connection: 不再转发的首部字段名
Connection: Keep-Alive
Connection: close
Date: Tue, 03 Jul 2012 04:40:59 GMT
Transfer-Encoding: chunked
Warning: [警告码][警告的主机:端口号] "[警告内容]" ([日期时间])
Via: 1.0 gw.hackr.jp(Squid/3.1), 1.1 a1.example.com(Squid/2.7)
```
