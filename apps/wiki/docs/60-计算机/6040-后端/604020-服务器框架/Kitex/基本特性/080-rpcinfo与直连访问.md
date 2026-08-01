---
id: 02167fea-7aa9-4c97-9f51-dd5a681c62e7
---

# Kitex rpcinfo 与直连访问

## RPCInfo

- RPCInfo 生命周期为请求开始到返回（性能考虑），随后放入 sync.Pool 复用;
- Server 端异步 goroutine 中读取可能读到脏数据或空指针 panic;
- 异步使用方式一: `rpcinfo.FreezeRPCInfo(ctx)` 复制只读副本再传给 goroutine;
- 异步使用方式二(v0.8.0+): `KITEX_DISABLE_RPCINFO_POOL=true` 或 `rpcinfo.EnablePool(false)` 关闭回收;
- 部分信息依赖传输协议（TTHeader/HTTP2）与对应 MetaHandler;

## 获取信息

- `kitexutil.GetCaller(ctx)`: 调用方 Service; `GetMethod(ctx)`: 方法名;
- `GetCallerAddr(ctx)`: 调用方地址; `GetIDLServiceName(ctx)`: IDL Service 名;
- `GetCallerHandlerMethod(ctx)`: 调用方 handler 接口名（需对方为 Kitex 或主动写 K_METHOD）;
- `GetTransportProtocol(ctx)`: 传输协议;
- 客户端获取服务端地址: `ctx = metainfo.WithBackwardValues(ctx)` 后调用，再 `metainfo.GetBackwardValue(ctx, consts.RemoteAddr)`; 不适用于 oneway;

## 直连访问

- `callopt.WithHostPort("127.0.0.1:8888")`: 指定 IP:Port，支持 IPv6 与 UDS socket 文件;
- `callopt.WithURL("http://myserverdomain.com:8888")`: 经默认 DNS resolver 解析，等效 WithHostPort;
- 自定义 DNS resolver: `client.WithHTTPResolver(myResolver)`，`Resolver` 接口为 `Resolve(string) (string, error)`;
- `client.WithHostPorts(...)`: client 级直连，覆盖服务发现;

## 预热

- v0.3.0+ `client.WithWarmingUp(&warmup.ClientOption{...})` 预先初始化服务发现与连接池，避免首请求延迟;
- `ResolverOption.Dests`: 预热服务发现目标; `PoolOption.ConnNum/Parallel/Targets`: 预热连接数;
- `ErrorHandling`: IgnoreError / WarningLog / ErrorLog / FailFast;
- 下游升级后不会重新预热;
