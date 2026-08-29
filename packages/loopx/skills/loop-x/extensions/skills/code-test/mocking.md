# Mocking at external seams

优先使用真实的 in-process modules 和本地可替代依赖；stand-in 只放在会带来不可控 I/O、时间或随机性的 system seam：

- 第三方 API 使用满足同一 port 的 mock adapter。
- 自有远程服务使用 in-memory adapter 验证业务 policy，另以 contract/integration test 验证 transport adapter。
- database 与 filesystem 优先使用隔离的真实实例或 in-memory 实现；成本或隔离条件不允许时才 mock。
- clock、randomness 与环境输入通过窄 interface 注入可重复值。

adapter 的 interface 以领域操作命名，例如 `chargePayment`、`loadOrders`；它返回稳定的领域 shape，把 HTTP、SDK 或 query 细节留在 adapter 内。这样测试准备只描述外部结果，不复制 production conditional logic。

每个 stand-in 都对应一个真实 external seam，生产与测试 adapters 满足同一契约，assertion 通过被测 module 的 public interface 观察行为时，mocking 设计完成。
