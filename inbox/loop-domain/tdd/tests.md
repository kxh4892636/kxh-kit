# 好测试与坏测试

## 好测试

**集成风格**：通过真实接口测试，而不是 mock 内部部件。

```typescript
// 好：测试可观察行为
test("用户可以用有效购物车结账", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征：

- 测试用户或调用方关心的行为
- 只使用公共 API
- 能经受内部重构
- 描述 WHAT，而不是 HOW
- 每个测试只验证一个逻辑断言

## 坏测试

**实现细节测试**：与内部结构耦合。

```typescript
// 坏：测试实现细节
test("checkout 会调用 paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

危险信号：

- mock 内部协作者
- 测试私有方法
- 断言调用次数或调用顺序
- 行为没变，只是重构后测试坏了
- 测试名描述 HOW，而不是 WHAT
- 绕过接口，用外部手段验证

```typescript
// 坏：绕过接口验证
test("createUser 会保存到数据库", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// 好：通过接口验证
test("createUser 创建的用户可以被读取", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**同义反复测试**：期望值复述实现，因此测试天然通过。

```typescript
// 坏：期望值用和代码相同的方式重新计算
test("calculateTotal 会汇总订单行", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// 好：期望值是独立的已知字面量
test("calculateTotal 会汇总订单行", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
