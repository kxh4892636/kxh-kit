---
id: 07c4312e-d600-4a9c-8ad2-3255f6745efa
anki: true
---

# 冲突与 upsert

## 冲突时的三种收尾

| 收尾                  | 生成 SQL                       | 用途             |
| --------------------- | ------------------------------ | ---------------- |
| `.doNothing()`        | `on conflict (col) do nothing` | 幂等初始化、去重 |
| `.doUpdateSet({...})` | `on conflict (col) do update`  | 覆盖成新值       |
| `.doUpdateSet(eb=>…)` | 值里可用 `excluded.列`         | 累加、条件更新   |

## 怎么写？

```ts
// 有就跳过
await db
  .insertInto("pet")
  .values({ name: "Catto", species: "cat", owner_id: 1 })
  .onConflict((oc) => oc.column("name").doNothing())
  .execute();

// 用 excluded 取「本次想插入的值」
await db
  .insertInto("pet")
  .values({ name: "Doggo", species: "dog", owner_id: 1 })
  .onConflict((oc) =>
    oc.column("name").doUpdateSet((eb) => ({ species: eb.ref("excluded.species") })),
  )
  .execute();
```

## 冲突目标怎么定？

- 单列 `.column("name")`、复合键 `.columns([...])`、具名约束 `.constraint("…")`;
- 指定列必须有唯一索引或主键，否则报「没有匹配的冲突目标」，见 [建表与索引](./003-建表与索引.md);

## 存在就累加怎么写？

```ts
await db
  .insertInto("stock")
  .values({ sku: "A-1", qty: 5 })
  .onConflict((oc) =>
    oc.column("sku").doUpdateSet((eb) => ({
      qty: eb("stock.qty", "+", eb.ref("excluded.qty")), // 旧值 + 本次值
    })),
  )
  .execute();
```

- `eb('stock.qty', …)` 是**旧值**，`excluded.qty` 是**本次提交的值**;

## 条件更新和批量怎么写？

- `.doUpdateSet(...).where("excluded.species", "!=", "cat")`: 条件为假时既不更新也不报错;
- 适合「只在值变化时更新」，避免覆盖别人刚写的数据;
- 批量 upsert: 一次 `.values(rows)` 加同样的 `.onConflict(...)`。
