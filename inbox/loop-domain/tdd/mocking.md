# 什么时候 mock

只在**系统边界** mock：

- 外部 API（支付、邮件等）
- 数据库（有时可以，但优先使用测试数据库）
- 时间或随机性
- 文件系统（有时可以）

不要 mock：

- 你自己的类或模块
- 内部协作者
- 任何你能控制的东西

## 为可 mock 性设计

在系统边界处，设计易于 mock 的接口：

**1. 使用依赖注入**

把外部依赖传入，而不是在内部创建：

```typescript
// 容易 mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// 难以 mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. 优先使用 SDK 风格接口，而不是通用 fetcher**

为每个外部操作创建具体函数，而不是用一个带条件逻辑的通用函数：

```typescript
// 好：每个函数都可以独立 mock
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// 坏：mock 内部需要条件逻辑
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK 风格意味着：

- 每个 mock 返回一个具体形状
- 测试设置中不需要条件逻辑
- 更容易看出测试覆盖了哪些端点
- 每个端点都有类型安全
