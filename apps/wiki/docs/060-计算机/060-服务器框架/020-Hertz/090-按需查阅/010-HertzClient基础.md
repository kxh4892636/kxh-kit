---
id: e6a3dd8e-140e-4ca6-aced-b368c34ad566
---

# Hertz Client 基础

## 如何发送一次 HTTP 请求？

- HTTPS: 示例显式使用 `pkg/network/standard`，保留默认服务端证书验证；请求超时配置来自 `pkg/common/config`;

```go
c, err := client.NewClient(client.WithDialer(standard.NewDialer()))
if err != nil {
	return err
}

req := protocol.AcquireRequest()
resp := protocol.AcquireResponse()
defer protocol.ReleaseRequest(req)
defer protocol.ReleaseResponse(resp)

req.SetRequestURI("https://example.com/articles/7")
req.SetOptions(config.WithRequestTimeout(time.Second))
req.Header.SetMethod(consts.MethodGet)
if err := c.Do(ctx, req, resp); err != nil {
	return fmt.Errorf("request article: %w", err)
}
```
