---
id: fb61e792-e991-4227-ae0d-5b11bf45405c
---

# Kitex 中间件与 Suite 扩展

## Middleware 基础

- `type Endpoint func(ctx, req, resp) error`; `type Middleware func(Endpoint) Endpoint`;
- 中间件嵌套串联，必须将 err 向上返回; 修改 response 上游可见;
- 获取真实 req/resp: 中间件参数是 `XXXArgs` / `XXXResult` 包装; thrift 用 `GetFirstArgument()` / `GetResult()` 断言，或 `GetReq/GetSuccess` 反射;

## 客户端中间件

- `client.WithMiddleware`: 在 Service 熔断和超时中间件之后执行;
- `client.WithInstanceMW`: 在服务发现、负载均衡之后执行（实例熔断器之后）; Proxy 场景不执行;
- `client.WithContextMiddlewares`: 通过 ctx 注入（`client.WithContextMiddlewares(ctx, mw)`），在 WithMiddleware 之前执行;
- `client.WithMiddlewareBuilder`: 根据框架 ctx 动态创建中间件;
- 调用顺序: xDS 路由/服务熔断/超时 → Context 中间件 → WithMiddleware → ACL → 服务发现/实例熔断/实例 MW → ErrorHandler;

## 服务端中间件

- `server.WithMiddleware`: 按 Option 顺序执行;
- 顺序: WithMiddleware → ACL → ErrorHandler;
- 捕获 handler panic: 判断 `errors.Is(err, kerrors.ErrPanic)`;
- 注意: RPCInfo 在 rpc 结束后回收，中间件内不要开 goroutine 操作 RPCInfo;

## gRPC Streaming 中间件

- 中间件无法 cover 消息本身; 通过包装 `streaming.Stream`（RecvMsg/SendMsg）记录消息;
- Client 侧在 next 返回后包装 `res.(*streaming.Result).Stream`; Server 侧在 next 前包装 `req.(*streaming.Args).Stream`;

## Suite

- `type Suite interface { Options() []Option }`，是 Option 与 Middleware 的组合封装;
- 只允许初始化时设置，不允许动态修改;
- 执行顺序: client 先设置先执行，server 相反;
- 启用: `client.WithSuite(...)` / `server.WithSuite(...)`; Suite 可嵌套 Suite;
- 推荐第三方扩展基于 Suite 提供能力，避免全局变量;
