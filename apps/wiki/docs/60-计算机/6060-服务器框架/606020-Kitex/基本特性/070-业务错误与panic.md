---
id: 6d7785f8-a6fe-4384-b820-d36281a6619a
---

# Kitex 业务错误与 panic

## 业务异常(BizStatusError)

- v0.4.3+ 提供; 用于区分业务错误与 RPC 链路异常;
- RPC 异常: 超时/熔断/限流等, RPC 层面失败; 业务错误: RPC 层面请求成功;
- 监控建议: RPC 错误上报失败, 业务错误上报成功并附加 biz_status_code;

## 接口与构造

- `BizStatusErrorIface`: `BizStatusCode()`, `BizMessage()`, `BizExtra()`, `Error()`;
- `kerrors.NewBizStatusError(code, msg)`, `NewBizStatusErrorWithExtra(code, msg, extra)`;
- gRPC 场景可用 `NewGRPCBizStatusError` 并实现 `GRPCStatusIface` 透传 Status Detail;
- Client 端用 `kerrors.FromBizStatusError(err)` 还原;

## 传输实现

- Thrift / KitexProtobuf: 依赖 TTHeader, 新增 `biz-status`, `biz-message`, `biz-extra` header;
- gRPC: 依赖 HTTP2 Header, 复用 `grpc-message`, 额外加 `biz-status`, `biz-extra`;
- 上游不支持自定义异常时也能正确处理错误, 只是丢失业务异常识别;

## 中间件中的业务异常

- handler 返回 BizStatusError 时中间件 next 得到的 error 为 nil;
- 获取: `rpcinfo.GetRPCInfo(ctx).Invocation().BizStatusErr()`;
- 返回: `InvocationSetter.SetBizStatusErr(bizErr)` 并 return nil;

## Panic 处理

- Kitex 自动 recover 业务 handler 及其他 panic, 保证服务稳定;
- 业务自己 `go` 出的 goroutine 中 panic 需自行 recover;
- 无法在 Server 中间件中先于框架 recover panic;
- 中间件获取 panic 详情: `ri.Stats().Panicked()` 返回 `(bool, err)`, err 为 recover 到的对象;
