---
id: 3ef245a8-b920-433d-97a9-262ba84494d7
---

# HTTP 协议接入速查

## 写普通 HTTP API 应该使用什么配置？

- 起点: 用默认 HTTP/1.1 跑通 JSON API，无需先学习 HTTP/2;
- 网关: 浏览器到网关可以协商 HTTP/2，网关到 Hertz 仍可使用 HTTP/1.1;
- 复用: 默认 keep-alive 能减少重复建连，先保证 Client 复用再考虑协议升级;

## 对接方明确要求 HTTP/2 时怎么做？

- 依赖: 接入 Hertz 的 HTTP/2 协议扩展；仅修改 Header 不会开启 HTTP/2;
- TLS: 公网通常通过 TLS + ALPN 协商，确认客户端、网关和 Hertz 三段都兼容;
- 验收: 在真实连接上检查协议版本，再验证请求、错误、关闭与 HTTP/1.1 回退;
- 调参: 多路复用、Header 压缩与流控只是能力背景；没有测量需求时不调窗口和 stream 数量;

## 对接方要求 H2C 时需要确认什么？

- H2C: 不使用 TLS 的 HTTP/2，只在受控网络且双方明确支持时使用;
- 协商: 确认采用 prior knowledge 还是 upgrade，并让代理与健康检查使用同样方式;
- 边界: H2C 不提供加密和身份认证；双向消息、服务端推送的选择见 [持续通信](./040-SSEWebSocket与流式响应.md);

## 需要核对具体用法时查哪里？

- 官方入口: [HTTP2](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/third-party/protocol/http2.md);
