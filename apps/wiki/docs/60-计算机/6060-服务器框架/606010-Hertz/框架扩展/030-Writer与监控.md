---
id: cc4049b5-0404-4ff8-a91d-689cbe886798
---

# Hertz 扩展: Writer 与监控

## Response Writer 劫持

- 默认分层架构中响应写操作在 handler 返回后进行, 无法在应用层控制分块时机;
- `c.Response.HijackWriter(w)` 劫持响应 writer, 垂直打通写响应限制;
- 接口: `ExtWriter`, 含 `io.Writer`, `Flush()`, `Finalize()`(框架释放前调用, 须幂等);
- 内置 `resp.NewChunkedBodyWriter(&c.Response, c.GetWriter())`: 在 handler 中立即 flush 分块;
- 观察效果: `curl -N --location localhost:8888/flush/chunk`;

## 日志扩展

- 接口定义在 `pkg/common/hlog`: `Logger`, `CtxLogger`, `FormatLogger`, `Control`;
- `FullLogger` 为四者组合; `hlog.SetLogger(fullLogger)` 注入;
- 封装默认实现会导致日志文件名/行号不准(call depth);

## 监控扩展

- 框架自身不带监控打点, 只提供 `Tracer` 接口;
- 实现 `Start/Finish`, 在 `Finish` 中通过 `c.GetTraceInfo().Stats()` 获取耗时, 包大小, 错误;
- `server.WithTracer(...)` 注入;

## 监控示例

```go
func (s *ServerTracer) Finish(ctx context.Context, c *app.RequestContext) {
	ti := c.GetTraceInfo()
	start := ti.Stats().GetEvent(stats.HTTPStart)
	finish := ti.Stats().GetEvent(stats.HTTPFinish)
	cost := finish.Time().Sub(start.Time())
	// record cost
}
```
