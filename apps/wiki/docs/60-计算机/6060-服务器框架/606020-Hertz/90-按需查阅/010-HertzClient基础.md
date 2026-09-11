---
id: e6a3dd8e-140e-4ca6-aced-b368c34ad566
---

# Hertz Client 基础

## 如何界定出站 Client 的职责？

- Hertz Client: 发起出站 HTTP 请求; 支持连接复用、超时、代理和扩展;
- 复用原则: Client 按目标策略长期复用，不按请求创建;
- 边界: 业务 Service 依赖领域 Client 接口，不直接传播 HTTP 类型;

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

## 如何把响应转换为领域结果？

- transport error: DNS、建连、TLS、取消或读写失败; 没有可信 HTTP status;
- HTTP error: 已收到响应，但 status 是 4xx/5xx;
- decode error: status/body 不符合预期契约;
- body limit: 在复制或反序列化前限制响应大小;
- Content-Type: 解码前验证媒体类型，不盲目把任意 body 当 JSON;

## 如何隔离外部 HTTP 契约？

```go
type ProfileClient interface {
	GetProfile(ctx context.Context, userID int64) (*Profile, error)
}
```

- 实践: 实现层构造 URL、Header 和协议模型;
- Service: 只看到领域参数、结果和可分类错误;
- 实践: 上游 404、429、5xx 映射为明确领域结果;
- 实践: 日志记录目标服务和路由模板，不记录 Token 和完整查询敏感值;

## 如何管理请求响应对象的所有权？

- 实践: 请求与响应对象由池获取时必须配对释放;
- 实践: 不在释放后保留 body slice; 需要跨生命周期就复制;
- 实践: 大响应使用流式处理，避免一次性加载内存;
- Client: 在进程级组装，配置变化通过受控重建完成;

## 需要核对具体用法时查哪里？

- 官方入口: [客户端](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/client.md);
