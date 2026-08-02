---
id: 651144e8-bec4-4512-83f6-3e7f7d46140f
---

# Engine 配置与生命周期

## 创建方式

- `server.Default`: 适合快速启动; 默认安装 Recovery 中间件;
- `server.New`: 显式选择 Options; 不会自动安装 Recovery，生产服务必须自行补上;
- Option: 构造 Engine 时设置地址、服务名、超时、网络库、TLS 和观测扩展;

```go
h := server.New(
	server.WithHostPorts("0.0.0.0:8080"),
	server.WithReadTimeout(3*time.Second),
	server.WithWriteTimeout(5*time.Second),
	server.WithIdleTimeout(60*time.Second),
)
```

## 超时边界

- read timeout: 限制读取完整请求的时间; 防止慢速请求长期占用连接;
- write timeout: 限制响应写出的时间; 流式接口不可机械套用短写超时;
- idle timeout: 限制 keep-alive 空闲连接; 不等于单次业务超时;
- 业务 timeout: 由 Handler 派生 `context.WithTimeout`，并传入下游调用;

## 生命周期

```text
读取配置 → 初始化依赖 → 注册中间件与路由 → Run/Spin
        → 停止接流 → 等待在途请求 → 关闭外部资源
```

- 配置冻结: Engine 启动前完成 Options 和路由注册;
- 依赖就绪: 数据库、缓存和观测 exporter 成功后才打开 readiness;
- 退出顺序: 先停止新请求，再等待 Handler，最后关闭数据库和 exporter;
- 配置来源: 开发环境可用 YAML; 密钥和环境差异由环境变量覆盖;

## 常见错误

- 默认值失控: 未明确监听地址、超时和最大请求体;
- timeout 混淆: 将连接空闲超时当作业务调用超时;
- Handler 中初始化 Client: 每次请求重复创建连接池;
- 启动后改路由: 引入并发风险和不可预测的服务行为;
