---
id: e6a3dd8e-140e-4ca6-aced-b368c34ad566
---

# Hertz Client 基础

## 定位

- Hertz Client: 发起出站 HTTP 请求; 支持连接复用、超时、代理和扩展;
- 复用原则: Client 按目标策略长期复用，不按请求创建;
- 边界: 业务 Service 依赖领域 Client 接口，不直接传播 HTTP 类型;

## 基本请求

```go
c, err := client.NewClient()
if err != nil {
	return err
}

req := protocol.AcquireRequest()
resp := protocol.AcquireResponse()
defer protocol.ReleaseRequest(req)
defer protocol.ReleaseResponse(resp)

req.SetRequestURI("https://example.com/articles/7")
req.Header.SetMethod(consts.MethodGet)
if err := c.Do(ctx, req, resp); err != nil {
	return fmt.Errorf("request article: %w", err)
}
```

## 响应处理

- transport error: DNS、建连、TLS、取消或读写失败; 没有可信 HTTP status;
- HTTP error: 已收到响应，但 status 是 4xx/5xx;
- decode error: status/body 不符合预期契约;
- body limit: 在复制或反序列化前限制响应大小;
- Content-Type: 解码前验证媒体类型，不盲目把任意 body 当 JSON;

## 领域适配

```go
type ProfileClient interface {
	GetProfile(ctx context.Context, userID int64) (*Profile, error)
}
```

- 实现层构造 URL、Header 和协议模型;
- Service 只看到领域参数、结果和可分类错误;
- 上游 404、429、5xx 映射为明确领域结果;
- 日志记录目标服务和路由模板，不记录 Token 和完整查询敏感值;

## 资源管理

- 请求与响应对象由池获取时必须配对释放;
- 不在释放后保留 body slice; 需要跨生命周期就复制;
- 大响应使用流式处理，避免一次性加载内存;
- Client 在进程级组装，配置变化通过受控重建完成;
