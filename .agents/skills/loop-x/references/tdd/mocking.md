# 何时 Mock

只在 **system boundaries** 进行 Mock:

- External APIs(payment, email 等).
- Databases(有时需要, 优先使用 test DB).
- 时间/随机性.
- File system(有时需要).

不要 mock:

- 你自己的 classes/modules.
- 内部协作者.
- 任何你控制的事物.

## 为 Mockability 进行设计

在 system boundaries 上, 设计易于 mock 的 interfaces:

**1. 使用 dependency injection**

传入 external dependencies, 而不是在内部创建它们:

```typescript
// 易于 mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// 难以 mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. 优先使用 SDK-style interfaces, 而不是 generic fetchers**

为每项外部操作创建具体 function, 而不是创建一个包含条件逻辑的 generic function:

```typescript
// GOOD: 每个 function 都可以独立 mock
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch("/orders", { method: "POST", body: data }),
};

// BAD: Mocking 要求 mock 内部存在 conditional logic
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK approach 意味着:

- 每个 mock 返回一种特定 shape.
- 测试准备中没有条件逻辑.
- 更容易看出测试使用了哪些 endpoints.
- 每个 endpoint 都有 type safety.
