---
id: 39897895-2444-4708-aa97-a09c1f911643
---

# Docker 与反向代理

## 如何构建最小运行镜像？

```dockerfile
FROM golang:1.25 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/article-api ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/article-api /article-api
USER nonroot:nonroot
ENTRYPOINT ["/article-api"]
```

- 多阶段: 构建工具不进入运行镜像;
- 非 root: 降低容器逃逸后的权限;
- 固定基础镜像: 使用 digest 或受控版本，并持续扫描漏洞;
- Secret: 运行时注入，不通过 `COPY` 或 ENV 固化;

## 如何划定反向代理职责？

- TLS: 终止与证书自动续期;
- 实践: 连接复用、请求大小和粗粒度限流;
- 实践: 规范化 Host、scheme 和客户端 IP Header;
- 实践: 访问日志、WAF 或边缘鉴权;
- 实践: 上游超时必须大于服务正常处理预算但有明确上限;

## 如何让 Hertz 配合入口代理？

- 实践: 监听 `0.0.0.0`，但只通过受控网络暴露;
- 实践: 仅信任已知代理网段提供的转发 Header;
- readiness: 通过后才加入上游;
- 实践: 收到 SIGTERM 后先 readiness=false，再执行 Shutdown;
- 实践: `/metrics`、pprof 和管理端点不直接暴露公网;

## 如何分配容器资源？

- CPU limit: 影响调度与延迟; 压测后设置;
- memory limit: 配合请求体限制、连接数和 Go 内存上限;
- replicas: 无状态 API 可水平扩展; Session 放共享存储;
- database pool: `单实例 maxOpen × 副本数` 不超过数据库预算;

## 如何接入 Kubernetes？

- Deployment: 配置滚动更新和 terminationGracePeriodSeconds;
- probes: startup、readiness、liveness 使用不同语义;
- Service/Ingress: 只暴露业务端口，管理端口独立保护;
- 配置: ConfigMap 放非敏感项，Secret 放密钥和证书;

## 需要核对具体用法时查哪里？

- 官方入口: [正向代理和反向代理](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/proxy.md)、[优雅退出](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/basic-feature/graceful-shutdown.md);
- 应用约定: 分层、业务码、数据模型、配置优先级和交付清单是笔记的开发示例，按项目调整；框架 API 以对应官方版本为准;
