---
id: 3083bc5b-df65-4f36-8792-28bb3da94e47
---

# HTTP2 与 TLS

## 如何在 Node 上启用 HTTP/2？

```ts
// 明文 h2c
import { createServer } from "node:http2";

serve({ fetch: app.fetch, createServer });

// TLS 加密的 h2
import { createSecureServer } from "node:http2";
import { readFileSync } from "node:fs";

serve({
  fetch: app.fetch,
  createServer: createSecureServer,
  serverOptions: {
    key: readFileSync("localhost-privkey.pem"),
    cert: readFileSync("localhost-cert.pem"),
  },
});
```

- `createServer` 换掉默认的 `node:http` 服务器实现，`serverOptions` 原样透传;
- 浏览器只在 TLS 上支持 HTTP/2，明文 h2c 仅用于内网服务间调用;
- HTTP/2 绑定类型是 `Http2Bindings`，不是 `HttpBindings`;

## 需要自己在 Node 上配 HTTPS 吗？

- 大多数部署里由反向代理（Nginx/ELB/CDN）终结 TLS，Node 侧保持 HTTP/1.1 更简单;
- 直接对公网暴露 Node 时才需要 `createSecureServer` + 证书;
- 证书续期、加密套件、OCSP 这类运维交给代理层，不要写进应用;

## 生产环境更推荐哪种组合？

| 组合                                      | 适用                   |
| ----------------------------------------- | ---------------------- |
| Node(HTTP/1.1) + Nginx/CDN 终结 TLS 与 h2 | 最常见，运维简单       |
| Node 直接 `createSecureServer`            | 内网小服务、无可控代理 |
| Node h2c                                  | 服务网格内部跳转       |

- 结论: 先选反代终结，把压缩、静态、证书、限流都放在那一层；Hono 只做应用逻辑;
- 换协议前先压测：HTTP/2 在小响应场景不一定更快，代理层的连接复用更关键;
