---
id: 141ad4c3-a4d4-457d-9774-5e6e2d6eaa77
---

# Kitex Options 配置

## Client 基础 Option

- `WithClientBasicInfo(ebi)`: 设置 Service 信息与 Tags（强烈建议）;
- `WithHostPorts(...)`: 直连目标，覆盖服务发现;
- `WithTransportProtocol(tp)`: 设置传输协议; 未设置默认 PurePayload;
- `WithShortConnection` / `WithLongConnection(cfg)` / `WithMuxConnection`(已废弃);
- `WithMiddleware` / `WithInstanceMW` / `WithMiddlewareBuilder`;
- `WithStreamOptions(...)`: 聚合流式配置（v0.13.0+）;
- `WithCircuitBreaker(cbs)`、`WithFailureRetry(fp)`、`WithBackupRequest(bp)`、`WithMixedRetry(mp)`;
- `WithRPCTimeout(d)`、`WithConnectTimeout(d)`、`WithTimeoutProvider(p)`;
- `WithDestService`、`WithTag(k, v)`、`WithStatsLevel(level)`;

## Client gRPC Option

- `WithGRPCConnPoolSize`、`WithGRPCWriteBufferSize`、`WithGRPCReadBufferSize`;
- `WithGRPCInitialWindowSize`、`WithGRPCInitialConnWindowSize`（流控窗口）;
- `WithGRPCMaxHeaderListSize`、`WithGRPCKeepaliveParams`、`WithGRPCTLSConfig`;

## Client 高级/扩展 Option

- `WithSuite`、`WithProxy`、`WithRetryContainer`、`WithWarmingUp`、`WithCloseCallbacks`;
- `WithErrorHandler`、`WithGeneric`、`WithACLRules`、`WithConnReporterEnabled`、`WithHTTPConnection`;
- `WithTracer`、`WithResolver`、`WithHTTPResolver`、`WithLoadBalancer`;
- `WithBoundHandler`、`WithCodec`、`WithPayloadCodec`、`WithMetaHandler`、`WithFirstMetaHandler`;
- `WithTransHandlerFactory`、`WithDiagnosisService`、`WithDialer`、`WithConnPool`;

## Server 基础 Option

- `WithServerBasicInfo(ebi)`、`WithServiceAddr(addr)`、`WithMuxTransport`(已废弃);
- `WithMiddleware`、`WithStreamOptions`、`WithLimit(option)`、`WithReadWriteTimeout`、`WithExitWaitTime`;
- `WithMaxConnIdleTime`、`WithStatsLevel`;

## Server gRPC Option

- `WithGRPCWriteBufferSize` / `WithGRPCReadBufferSize` / `WithGRPCInitialWindowSize` / `WithGRPCInitialConnWindowSize`;
- `WithGRPCKeepaliveParams`、`WithGRPCKeepaliveEnforcementPolicy`、`WithGRPCMaxConcurrentStreams`、`WithGRPCMaxHeaderListSize`;

## Server 高级/扩展 Option

- `WithSuite`、`WithProxy`、`WithRegistryInfo`、`WithGeneric`、`WithErrorHandler`;
- `WithACLRules`、`WithExitSignal`、`WithReusePort`;
- `WithRegistry`、`WithTracer`、`WithCodec`、`WithPayloadCodec`、`WithMetaHandler`;
- `WithBoundHandler`、`WithConcurrencyLimiter`、`WithQPSLimiter`、`WithLimitReporter`;
- `WithTransHandlerFactory`、`WithTransServerFactory`、`WithDiagnosisService`;

## Call Option

- `callopt.WithHostPort` / `WithURL`: 本次调用直连;
- `callopt.WithTag(k, v)`: 调用级 tag;
- `callopt.WithRPCTimeout` / `WithConnectTimeout`: 调用级超时（优先于 Client Option）;
- `callopt.WithHTTPHost`: HTTP 连接场景指定 Host;
- `callopt.WithRetryPolicy` / `WithMixedRetry` / `WithFallback`: 调用级治理;
