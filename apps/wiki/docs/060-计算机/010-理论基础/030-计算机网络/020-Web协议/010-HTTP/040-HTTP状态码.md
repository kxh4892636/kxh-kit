---
id: 6d84d2eb-3b12-43c9-afb3-0734f7f2a1b2
---

# HTTP 状态码

## 状态码按首位数字分为哪几类？

| 类别 | 英文          | 含义                     |
| ---- | ------------- | ------------------------ |
| 1XX  | Informational | 接收的请求正在处理       |
| 2XX  | Success       | 请求正常处理完毕         |
| 3XX  | Redirection   | 需要附加操作才能完成请求 |
| 4XX  | Client Error  | 客户端发送的请求有错     |
| 5XX  | Server Error  | 服务端处理请求出错       |

## 常见的成功状态码有哪些？

- 200 OK: 请求正常处理;
- 201 Created: 处理成功并创建了新资源;
- 202 Accepted: 请求已接收但尚未处理;
- 203 Non-Authoritative Information: 返回信息来自另一来源;
- 204 No Content: 处理成功, 响应报文无主体;
- 206 Partial Content: 返回指定范围的报文主体, 用于范围请求;

## 常见的重定向状态码有哪些？

- 301 Moved Permanently: 永久重定向, 之后都用新 URL;
- 302 Found: 临时重定向, 仍希望用户使用原 URL;
- 303 See Other: 同 302, 但要求客户端用 GET 访问新 URL;
- 304 Not Modified: 条件请求不满足(资源未变), 直接使用本地缓存;
- 305 Use Proxy: 需使用代理访问;
- 307 Temporary Redirect: 同 302, 但保持请求方法不变;
- 易错点: 301/302/303 返回时, 几乎所有浏览器都会把请求方法改成 GET;

## 常见的客户端错误状态码有哪些？

- 400 Bad Request: 请求报文存在语法错误;
- 401 Unauthorized: 需要携带 HTTP 认证信息;
- 403 Forbidden: 服务端拒绝访问;
- 404 Not Found: 服务端未找到资源;
- 405 Method Not Allowed: 该 HTTP 方法被禁用;
- 408 Request Timeout: 请求超时;
- 412 Precondition Failed: 条件请求不满足条件;

## 常见的服务端错误状态码有哪些？

- 500 Internal Server Error: 服务端执行请求报错;
- 502 Bad Gateway: 网关从上游收到非法响应;
- 503 Service Unavailable: 服务端停机维护或过载;
- 504 Gateway Timeout: 网关等待上游响应超时;
- 505 HTTP Version Not Supported: 服务端不支持请求的 HTTP 版本;
