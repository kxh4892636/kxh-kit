---
id: eef15cb5-3470-42af-874b-4e8cb04dc2eb
anki: true
---

# HTTP2 与 TLS

## 开 HTTP/2 需要哪些前提？

- 默认从 HTTP/1.1 起步，能跑通再谈 HTTP/2；协议版本不是性能银弹;
- HTTP/2 的公网形态是 TLS + ALPN 协商，不是改一个 Header;
- 中间设备可能只支持 HTTP/1.1，强制 HTTP/2 会导致握手失败;
- 证书、协议、超时要在客户端、网关、服务三段都核对;
- TLS 最低版本、加密套件、证书链要与组织基线一致;
- 多路复用会放大单连接故障的影响，连接级超时与重试要重新评估;
- 适用: 对外提供 HTTPS 或需要多路复用的服务。

## 什么流量该走 HTTP/1.1、HTTP/2 或 H2C？

| 场景                       | 选择                                      |
| -------------------------- | ----------------------------------------- |
| 普通 JSON API              | HTTP/1.1 + keep-alive                     |
| 浏览器到网关               | HTTPS + HTTP/2，网关到服务可仍用 HTTP/1.1 |
| 内网服务间、已确认双方支持 | H2C（受控网络）                           |
| 需要双向流                 | HTTP/2 或 RPC streaming                   |

- H2C 是不加密的 HTTP/2，只在受控网络使用，不提供加密与身份认证；放到不可信网络等于明文被中间人读写;
- 证书链缺失时，部分客户端能连、部分不能，问题难复现。

## 怎么验证 ALPN 协商与证书链？

```bash
# 看 ALPN 协商结果与证书链
openssl s_client -connect example.com:443 -alpn h2 -servername example.com

# 强制 HTTP/2 请求
curl --http2 -I https://example.com/
```

```nginx
# 网关终结 TLS 与 HTTP/2，后端仍用 HTTP/1.1
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate     /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://app:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

## 协议升级后会看到什么症状？

| 症状                     | 原因                                  |
| ------------------------ | ------------------------------------- |
| 客户端握手失败           | 中间设备不支持 HTTP/2，或 ALPN 未配置 |
| 部分客户端证书错误       | 证书链不完整                          |
| H2C 被中间人读取         | 在不可信网络用了明文 HTTP/2           |
| 开启 HTTP/2 后延迟毛刺   | 单连接多路复用被队头阻塞放大          |
| 回退 HTTP/1.1 后行为不同 | 两条路径的超时、缓冲、头处理不一致    |
