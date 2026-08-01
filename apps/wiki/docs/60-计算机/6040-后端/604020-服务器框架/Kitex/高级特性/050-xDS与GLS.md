---
id: 4ef5eae1-3a68-4171-934a-5ad54cdae1ef
---

# Kitex xDS 与 GLS

## xDS 支持

- xDS = X Discovery Service（LDS/RDS/CDS/EDS 等），数据面与控制面（如 Istio）通信;
- Kitex 通过 `kitex-contrib/xds` 支持，Proxyless 模式运行;
- 已支持: 服务发现、路由（method 精确匹配、header 精确/前缀/正则）、超时、重试、限流、熔断;

## 开启方式

```go
xds.Init()
cli, err := greetservice.NewClient(destService, xdssuite.NewClientOption())
```

- 需要 K8s 环境变量: `POD_NAMESPACE`、`POD_NAME`、`INSTANCE_IP`、`KITEX_XDS_METAS`;
- Client destService 用 K8s URL 格式: `<service>.<namespace>.svc.cluster.local:<port>`;
- Server 加 `xdssuite.NewLimiter()` 开启限流;
- 路由标签: `client.WithTag("stage", "canary")` / `callopt.WithTag(...)` 匹配 VirtualService;
- method 路由: VirtualService uri 格式 `/${PackageName}.${ServiceName}/${MethodName}`;
- 熔断: xDS 默认实例级熔断，`xdssuite.WithServiceCircuitBreak(true)` 切服务级; 配置通过 EnvoyFilter OutlierDetection;
- 重试: EnvoyFilter RetryPolicy，`kitexRetryErrorRate` / `kitexRetryMethods` 映射 Kitex 配置; VirtualService retries 简单但生产不建议;
- 限流: EnvoyFilter LocalRateLimit，tokens_per_fill 建议为 10 的整数（令牌桶每 100ms 补充 1/10）;
- 依赖: 基础能力 Kitex >= v0.4.0 + xds >= 0.2.0; 完整能力 Kitex >= v0.10.3 + xds >= 0.4.1;
- 不足: 不支持 mTLS（需 PeerAuthentication 禁用）; 不支持负载均衡动态下发;

## GLS（Goroutine-Local-Storage）

- 存储 goroutine 内上下文，类似 context 但无需显式传递;
- 可在父子协程间传递（需开启选项）;
- 框架用于 context 备份，避免误传 context 导致 metainfo 等链路信息丢失;
- Server: `server.WithContextBackup(true, true)`（第二参数 async 开启异步隐式透传）;
- 环境变量 `CLOUDWEGO_SESSION_CONFIG_KEY`: `[{异步}],[{分片}],[{GC间隔}]`;
- Client: `client.WithContextBackup(handler)`，BackupHandler 签名 `func(prev, cur context.Context) (ctx context.Context, backup bool)`;
