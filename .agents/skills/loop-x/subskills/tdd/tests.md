# 良好与糟糕的 Tests

## 良好的 Tests

**Integration-style**: 通过真实 interfaces 进行测试, 而不是 mock 内部部分.

```typescript
// GOOD: 测试 observable behavior
test("用户可以使用有效 cart 结账", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

特征:

- 测试用户/调用方关心的行为.
- 只使用 public API.
- 能经受内部重构.
- 描述 WHAT, 而不是 HOW.
- 每个 test 只有一个 logical assertion.

## 糟糕的 Tests

**Implementation-detail tests**: 与内部结构耦合.

```typescript
// BAD: 测试 implementation details
test("checkout 调用 paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

危险信号:

- Mock internal collaborators.
- 测试 private methods.
- 对 call counts/order 作出断言.
- 行为没有变化, 测试却在重构时失败.
- 测试名称描述 HOW, 而不是 WHAT.
- 通过 external means 验证, 而不是通过 interface 验证.

```typescript
// BAD: 绕过 interface 进行验证
test("createUser 保存到 database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: 通过 interface 验证
test("createUser 使 user 可被检索", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautological tests**: Expected value 重述 implementation, 因此测试由构造保证通过.

```typescript
// BAD: 使用与代码相同的方式重新计算 expected value
test("calculateTotal 对 line items 求和", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: Expected value 是独立的 known literal
test("calculateTotal 对 line items 求和", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
