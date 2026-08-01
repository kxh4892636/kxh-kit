---
id: 13e398e7-13be-4480-9afa-cd4ddb21f03b
---

# Hertz HTTP2 与 WebSocket

## HTTP2

- 支持 h2（TLS）与 h2c（明文），参考 net/http2 实现;
- 引入 `hertz-contrib/http2/factory`;
- Server: `h.AddProtocol("h2", factory.NewServerFactory(...))`，TLS 场景配 `WithTLS` + `WithALPN(true)` + `NextProtos` 加 "h2";
- h2c: `server.WithH2C(true)` + `AddProtocol("h2", factory.NewServerFactory())`;
- Client: `cli.SetClientFactory(factory.NewClientFactory(config.WithAllowHTTP(true)))`;
- Server 配置: `WithReadTimeout`、`WithDisableKeepAlive`;
- Client 配置: `WithMaxHeaderListSize`(0=10MB 默认)、`WithReadIdleTimeout`(ping 健康检查)、`WithPingTimeout`(15s)、`WithWriteByteTimeout`、`WithAllowHTTP`、`WithStrictMaxConcurrentStreams`、`WithMaxIdempotentCallAttempts`、`WithRetryConfig`;

## WebSocket

- 旧 `hertz-contrib/websocket` 已废弃，推荐 `gorilla/websocket` + `adaptor.HertzHandler`;
- 旧实现基于 HTTP 连接劫持（hijack）;

```go
var upgrader = websocket.Upgrader{}
func echo(w http.ResponseWriter, r *http.Request) {
	c, _ := upgrader.Upgrade(w, r, nil)
	defer c.Close()
	for {
		mt, msg, err := c.ReadMessage()
		if err != nil { break }
		c.WriteMessage(mt, msg)
	}
}
h.GET("/echo", adaptor.HertzHandler(http.HandlerFunc(echo)))
```

- 旧版 Upgrader 配置: `ReadBufferSize`、`WriteBufferSize`、`WriteBufferPool`、`Subprotocols`、`CheckOrigin`、`EnableCompression`;
- 旧版需 `h.NoHijackConnPool = true` 避免二次关闭异常;
- 劫持连接仅能关闭一次;
