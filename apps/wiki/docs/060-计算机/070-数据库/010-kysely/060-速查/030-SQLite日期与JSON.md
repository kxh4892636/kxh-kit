---
id: 2b47575c-5fc1-41e0-82a2-74815ccb67a2
---

# SQLite 日期与 JSON 列

## 日期到底该声明成什么？

- 驱动返回什么就声明什么：`better-sqlite3` 对 `text` 列返回 `string`，对 `integer` 列返回 `number`;
- 想用 `Date`，就在读写层转换，或用 `ColumnType<Date, string, string>` 再自己转;

```ts
// 务实写法：库里存 text，代码里就是 string
created_at: Generated<string>;

// 想要 Date 对象：靠应用层转换，Kysely 不做转换
created_at: ColumnType<Date, string, string>;
```

- 排序陷阱：`text` 日期只有格式统一（如 `YYYY-MM-DD HH:MM:SS`）才能按字典序当时间序;
- 时间默认值用 `sql`CURRENT_TIMESTAMP``，SQLite 没有 `now()`。

## JSON 列怎么用才不踩坑？

- 建表用 `text`，插入时 `JSON.stringify`，读取前装 `ParseJSONResultsPlugin`;

```ts
metadata: JSONColumnType<{ plan: 'free' | 'premium' }> // 插入类型是 string

await db.insertInto('person').values({ metadata: JSON.stringify({ plan: 'free' }), ... }).execute()
```

- 嵌套查询（`jsonArrayFrom` / `jsonObjectFrom`）在 SQLite 上**必须**装该插件，否则拿到原始字符串;
- 可空 JSON 列要用 `ColumnType<T | null, string | null, string | null>`;
- 插件配置见 [内置插件](../050-进阶/010-内置插件.md)，嵌套查询见 [嵌套关联查询](../050-进阶/030-嵌套关联查询.md)。

## 想在 SQL 里直接查 JSON 字段怎么办？

- SQLite 提供 `json_extract(列, '$.字段')`，但 Kysely 没有专门方法，要用 `sql` 片段;

```ts
const rows = await db
  .selectFrom("person")
  .selectAll()
  .where(sql`json_extract(metadata, '$.plan')`, "=", "premium")
  .execute();
```

- 高频查询的 JSON 字段建议抽成独立列并建索引，别长期依赖 `json_extract`。

## 其它类型差异看哪里？

- 数字、布尔、占位符等运行时差异见 [SQLite 类型与运行时差异](./020-SQLite类型与运行时差异.md);
- 并发与运维参数见 [SQLite 并发与运维](./040-SQLite并发与运维.md)。
