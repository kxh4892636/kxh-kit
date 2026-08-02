---
id: 6018a72f-e6be-4982-b5f0-e22a4a3e4994
---

# Zap 日志与 Request ID

## 日志目标

- 结构化: 字段和值分离，便于搜索和聚合;
- 统一接口: 通过 Hertz logger 扩展接入 Zap，不让业务依赖全局 logger;
- 请求关联: request_id、trace_id、method、path、status 和 latency_ms;
- 错误关联: 记录稳定错误码、错误链和必要堆栈;

## 访问日志中间件

```text
request_id  method  route  status  latency_ms  client_ip
user_id     error_code  trace_id  response_bytes
```

- route: 记录路由模板 `/articles/:id`，避免真实 ID 造成高基数;
- client_ip: 只从可信代理链解析;
- user_id: 认证后可记录内部 ID，不记录用户名或 Token;
- body: 默认不记录请求和响应 body;

## Request ID

- 入站: 接受合法、长度受限的 `X-Request-ID`，否则生成新值;
- 响应: 回写同一 ID，方便调用方报告问题;
- 下游: 作为 Header 传播给 HTTP/RPC 服务;
- Trace: request_id 可用于日志检索，但不替代 trace_id;
- Hertz 集成: 可使用 `hertz-contrib/requestid` 与 Zap logger 扩展;

## 日志级别

- debug: 本地诊断细节; 生产默认关闭或采样;
- info: 启停、配置摘要、请求结果和重要状态变化;
- warn: 可恢复异常、重试和逼近容量限制;
- error: 当前操作失败，需要排查; 不能由底层库直接结束进程;

## 数据保护

- 永不记录: 密码、Authorization、Cookie、私钥和完整 DSN;
- 条件记录: 邮箱、手机号和 IP 按合规要求脱敏或散列;
- 日志注入: 对换行和控制字符规范化;
- 保留期: 根据诊断、成本与隐私要求设置，不无限存储;
