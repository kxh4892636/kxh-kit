---
id: 84c5534e-7036-4348-8fec-16df60843372
---

# HTTP 与 URI 基础

## Web 由哪三项核心技术构成？

- HTML: 网页文本标记语言, 描述文档结构;
- HTTP: 超文本传输协议 (HyperText Transfer Protocol), 传输 HTML 等资源;
- URL: 统一资源定位符 (Uniform Resource Locator), 定位资源地址;

## URI 与 URL 是什么关系？

- URI: 统一资源标识符 (Uniform Resource Identifier), 某个协议方案下资源的定位标识符;
- URL: URI 在 HTTP 协议下的子集;
- 其他方案下的 URI 形式:

```bash
ftp://ftp.is.co.za/rfc/rfc1808.txt
http://www.ietf.org/rfc/rfc2396.txt
ldap://[2001:db8::7]/c=GB?objectClass?one
mailto:John.Doe@example.com
tel:+1-816-555-1212
urn:oasis:names:specification:docbook:dtd:xml:4.1.2
```

## HTTP 依赖哪些协议完成一次通信？

- IP: 负责不同主机之间的通信, 定位到主机;
- TCP: 负责不同进程之间的通信, 提供可靠字节流;
- DNS: 把 URL 中的主机名解析为 IP 地址;
