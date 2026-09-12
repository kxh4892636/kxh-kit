# 测试示例

## Observable behavior

**Integration-style** 测试通过真实 public interfaces 观察用户关心的行为，内部重构后仍成立；名称描述 WHAT，每个 test 一个 logical assertion。

```typescript
test("用户可以使用有效 cart 结账", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

**Implementation-detail** 的信号：mock internal collaborators、测 private methods、断言内部调用次数/顺序、名称描述 HOW，或绕过 interface 检查内部状态；行为未变而重构使测试失败。

通过可检索行为验证保存结果，避免直接查询数据库作为 side channel：

```typescript
test("createUser 使 user 可被检索", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

## Independent expected values

**Tautological** 测试重算实现。例如用 `items.reduce((sum, i) => sum + i.price, 0)` 作为求和函数的 expected value，两者无法独立产生分歧。使用独立 known literal：

```typescript
test("calculateTotal 对 line items 求和", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
