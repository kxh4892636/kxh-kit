# 何时 Mock

只在 system boundaries 使用 mock：外部 API、时间/随机性，以及必要时的数据库或文件系统；数据库优先 test DB。自有 classes/modules、内部协作者及其他受控对象不 mock，使用真实实现。自有远程服务和可本地替代依赖的 adapter 策略由 `/code-design` 指导。

## Mockability

外部依赖通过 injection 传入，避免在拥有业务逻辑的函数内创建客户端：

```typescript
const processPayment = (order, paymentClient) => paymentClient.charge(order.total);
```

优先具体的 SDK-style 操作，避免让 mock 根据 generic fetcher 的 endpoint/options 分支：

```typescript
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};
```

每个操作独立 mock，返回确定 shape；测试准备无须分派条件，所用 endpoint 和类型清晰。
