---
id: a672fbfb-d8f3-4187-975c-48741e2a9b9a
---

# Kitex 第三方集成与 kitexcall

## 服务发现集成

- 已支持: DNS、etcd、zookeeper、eureka、consul、nacos、polaris、servicecomb、rule-based;
- DNS Resolver 常用于 Kubernetes 集群;
- 使用模式: 创建 Registry/Resolver 后通过 `server.WithRegistry(...)` / `client.WithResolver(...)` 注入;
- nacos 分 v1（registry-nacos）与 v2（registry-nacos/v2）SDK;

## 配置中心集成

- 支持: nacos、etcd、apollo、file、zookeeper、consul;
- 通过 Suite 转换配置到 Kitex 治理特性（超时、重试、熔断、服务端限流）;

```go
svr := xxxservice.NewServer(handler, server.WithSuite(yourConfigServerSuite))
cli := xxxservice.NewClient("dest", client.WithSuite(yourConfigClientSuite))
```

- config-file 支持 json / yaml;
- 配置动态生效（准实时）;

## 可观测集成

- 监控: monitor-prometheus、obs-opentelemetry;
- 链路追踪: tracer-opentracing、obs-opentelemetry;
- 日志: logrus、zap、slog（obs-opentelemetry 提供）;

## 协议互通

- codec-dubbo: Dubbo 编解码器，与 Dubbo 框架互通;
- xds: Proxyless 模式接入服务网格;
- opensergo: 集成 Sentinel 流量治理;

## kitexcall 工具

- CLI 工具，用 JSON 通用请求调用 RPC（无需生成代码）;

```shell
go install github.com/kitex-contrib/kitexcall@latest
kitexcall -idl-path echo.thrift -m echo -d '{"message": "hello"}' -e 127.0.0.1:9999
```

- 支持 Thrift/Protobuf IDL; 传输协议 Buffered/TTHeader/Framed/TTHeaderFramed;
- 常用参数: `-t/-type`、`-p/-idl-path`、`-m/-method`（`IDLServiceName/MethodName`，MultiService 时必须）;
- `-d` 数据、`-f` JSON 文件、`-e` 端点（可多个）;
- `-transport` 指定协议; `-biz-error` 接收业务异常;
- `-meta`（单跳）、`-meta-persistent`（持续）、`-meta-backward`（反向接收）;
- `-q` 只输出 JSON 响应; `-v` 详细模式;
