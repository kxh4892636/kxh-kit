---
id: cb27cbc6-3fe5-4d6d-bf33-17e13677ff94
---

# upsert 的取值与条件

## 怎样引用「这次想插入的值」？

- 用 `excluded` 虚拟表，必须通过 `eb.ref` 才能保持类型检查;
- `excluded` 代表「本来要插入的那一行」，冲突时可用它覆盖旧值;

```ts
await db
  .insertInto("pet")
  .values({ name: "Doggo", species: "dog", owner_id: 1 })
  .onConflict((oc) =>
    oc.column("name").doUpdateSet((eb) => ({
      species: eb.ref("excluded.species"),
      owner_id: eb.ref("excluded.owner_id"),
    })),
  )
  .execute();
```

## 怎样做「存在就累加」？

- `doUpdateSet` 的值可以是任意表达式，直接基于旧值算;

```ts
await db
  .insertInto("stock")
  .values({ sku: "A-1", qty: 5 })
  .onConflict((oc) =>
    oc.column("sku").doUpdateSet((eb) => ({ qty: eb("stock.qty", "+", eb.ref("excluded.qty")) })),
  )
  .execute();
```

- `eb('stock.qty', '+', ...)` 里的 `stock.qty` 是**旧值**，`excluded.qty` 是**本次提交的值**;
- 想取两者较大值时，用 `sql` 或条件表达式包一层，见 [表达式与表达式构造器](../020-查询数据/040-表达式与表达式构造器.md)。

## `doUpdateSet` 什么时候该跳过？

- 后面继续 `.where(...)`，条件为假时不做更新，也不报错;
- 典型用途：只在值发生变化时更新、避免覆盖更新的数据;

```ts
await db
  .insertInto("pet")
  .values({ name: "Catto", species: "dog", owner_id: 1 })
  .onConflict((oc) =>
    oc.column("name").doUpdateSet({ species: "dog" }).where("excluded.species", "!=", "cat"),
  )
  .execute();
```

## `doUpdateSet` 里能引用别的表吗？

- SQLite 的 `on conflict do update` 只允许引用目标表与 `excluded`;
- 需要跨表校验时，先在应用层查一次，或拆成两个事务语句;
- 冲突目标与基本写法见 [冲突处理](./040-冲突处理.md)。
