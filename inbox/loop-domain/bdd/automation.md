# 自动化边界

只在**行为边界**自动化场景：

- 公共工作流
- 真实调用方使用的 API 或命令边界
- 作为受支持接口暴露的领域服务
- 契约稳定的系统边界

优先选择能证明行为的最薄驱动。一个场景可以通过 UI、HTTP、RPC、CLI 或领域 API 运行；选择与验收决策匹配、且能保持场景稳定的边界。

## 步骤定义

步骤定义把领域语言翻译成可执行动作。保持朴素直接：

**1. 按含义复用步骤**

一个步骤应该表达一个领域概念，而不是一个偶然动作。

```typescript
// 好：领域步骤
Given("Alice 是信用额度为 {int} 的已批准客户", async (limit) => {
  await customers.createApproved({ name: "Alice", creditLimit: limit });
});

// 坏：把 UI 脚本藏在看似领域化的名称后
Given("Alice 是信用额度为 {int} 的已批准客户", async (limit) => {
  await page.goto("/admin/customers");
  await page.fill("#name", "Alice");
  await page.fill("#creditLimit", String(limit));
  await page.click("#approve");
});
```

**2. 只在场景结果处断言**

中间设置负责创建状态；最终步骤负责验证可观察行为。

```typescript
// 好：结果断言
Then("订单被确认", async () => {
  await expect(orders.current()).resolves.toMatchObject({ status: "confirmed" });
});

// 坏：内部断言
Then("订单服务发布 OrderConfirmed 事件", async () => {
  expect(orderService.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "OrderConfirmed" }));
});
```

## 测试数据

当数据承载含义时，使用具名示例：

- “Alice 是已批准客户”，而不是“存在一个用户”
- “信用额度为 500”，而不是“有效信用”
- “购物车总额是 120”，而不是“非空购物车”

数据应该让规则更清晰。如果某个值不影响行为，把它移到设置默认值里，而不是在场景中反复出现。
