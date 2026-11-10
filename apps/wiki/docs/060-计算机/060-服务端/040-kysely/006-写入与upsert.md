---
id: 46e5f05b-a268-42da-91af-d8dbdc4298d8
anki: true
---

# 写入与 upsert

## 插入怎么写？

```ts
const inserted = await db
  .insertInto("person")
  .values({ first_name: "Jennifer" })
  .executeTakeFirst();
Number(inserted.insertId); // 1（bigint）

// 多行用数组。调两次 .values() 是覆盖，不是追加
await db
  .insertInto("person")
  .values([{ first_name: "A" }, { first_name: "B" }])
  .execute();
```

- 要插入后的行加 `.returningAll()`, 只要部分列用 `.returning([...])`;

## 更新、删除怎么写？

```ts
const updated = await db
  .updateTable("person")
  .set({ age: 30 })
  .where("id", "=", 1)
  .executeTakeFirst();
Number(updated.numUpdatedRows); // 1

// set 里放表达式：旧值 + 1
await db
  .updateTable("person")
  .set((eb) => ({ age: eb("age", "+", 1) }))
  .where("id", "=", 1)
  .execute();

const deleted = await db.deleteFrom("person").where("id", "=", 1).executeTakeFirst();
Number(deleted.numDeletedRows); // 1

await db.deleteFrom("pet").where("name", "=", "Catto").returningAll().execute(); // 拿回被删的行
```

- `.where()` 必写; 漏了就是整表改或清库, Kysely 不拦;
- 要改后的行就 `.returning([...])`, 此时不再返回影响行数;
- 建表写了 `onDelete('cascade')` 才会级联删子行;
- SQLite 没有 `truncate`; 清空整表用 `sql` 模板执行 `delete from`;

## 冲突时怎么写？

| 收尾                  | 生成 SQL                       | 用途             |
| --------------------- | ------------------------------ | ---------------- |
| `.doNothing()`        | `on conflict (col) do nothing` | 幂等初始化、去重 |
| `.doUpdateSet({...})` | `on conflict (col) do update`  | 覆盖成新值       |
| `.doUpdateSet(eb=>…)` | 值里可用 `excluded.列`         | 累加、条件更新   |

```ts
// 有就跳过
await db
  .insertInto("pet")
  .values({ name: "Catto", species: "cat" })
  .onConflict((oc) => oc.column("name").doNothing())
  .execute();

// excluded 取「本次想插入的值」
await db
  .insertInto("pet")
  .values({ name: "Doggo", species: "dog" })
  .onConflict((oc) =>
    oc.column("name").doUpdateSet((eb) => ({ species: eb.ref("excluded.species") })),
  )
  .execute();

// 存在就累加：eb('stock.qty') 是旧值，excluded.qty 是本次值
await db
  .insertInto("stock")
  .values({ sku: "A-1", qty: 5 })
  .onConflict((oc) =>
    oc.column("sku").doUpdateSet((eb) => ({ qty: eb("stock.qty", "+", eb.ref("excluded.qty")) })),
  )
  .execute();
```

- 冲突目标: 单列 `.column()`、复合键 `.columns([...])`、具名约束 `.constraint()`; 指定列必须有唯一索引或主键, 否则报「没有匹配的冲突目标」, 见 [003](./003-建表与增删改查.md);
- `.doUpdateSet(...).where("excluded.species", "!=", "cat")` 条件为假时既不更新也不报错; 批量 upsert 一次 `.values(rows)` 加同样的 `.onConflict(...)`;

## 一次写很多行怎么办？

```ts
await db.transaction().execute(async (trx) => {
  for (let i = 0; i < rows.length; i += 500) {
    await trx
      .insertInto("person")
      .values(rows.slice(i, i + 500))
      .execute();
  }
});
```

- 单语句参数上限 32766, 按「列数 × 行数 < 3 万」切批, 超了报 `too many SQL variables`; 批量写要包一个事务, 否则每条语句各提交一次; 事务边界见 [Repository 与事务](../000-服务端知识/050-数据访问/010-Repository与事务.md);
