---
id: d7984217-797e-490e-a291-6a2d683eeb3a
---

# SQLite 类型与运行时差异

## SQLite 在 Kysely 里哪些表现与别的库不同？

| 主题                   | SQLite 行为                            | 影响                                    |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| 占位符                 | `?`                                    | `.compile()` 里看不到 `$1` 风格参数     |
| `insertId`             | 有，但类型是 `bigint`                  | 不能直接参与数字运算                    |
| 日期                   | 无原生日期类型，存 `text`/`integer`    | 声明 `Date` 会与运行时字符串不符        |
| JSON                   | 存 `text`，驱动不自动解析              | 嵌套查询必须装 `ParseJSONResultsPlugin` |
| 布尔                   | 必须存 `0`/`1`，传 `true` 会被驱动拒绝 | 列声明 `number` 或 `0 \| 1`             |
| `returning`            | 3.35+ 支持                             | 本项目驱动满足，可放心用                |
| `truncate`             | 不支持                                 | 用 `delete from` 代替                   |
| `rightJoin`/`fullJoin` | 3.39+                                  | 旧版本报语法错误                        |

## 数字和 id 为什么是 `bigint`？

- `better-sqlite3` 对 `insertId`、`numUpdatedRows`、`numDeletedRows` 返回 `bigint`;
- `Database` 里声明的 `Generated<number>` 只影响读取的行，不影响这些结果对象;

```ts
const result = await db.insertInto('person').values({ ... }).executeTakeFirstOrThrow()
const id = Number(result.insertId) // bigint → number
```

## 布尔值为什么一插就报错？

- `better-sqlite3` 只接受 number/string/bigint/buffer/null，传 JS `true` 会报
  `can only bind numbers, strings, bigints, buffers, and null`;
- 把列声明成 `number`（或 `0 | 1`），读出来也是数字;

```ts
interface DB {
  flag: { id: number; active: 0 | 1 };
}

await db.insertInto("flag").values({ active: 1 }).execute();
const row = await db.selectFrom("flag").selectAll().executeTakeFirstOrThrow(); // { id: 1, active: 1 }
```

- 业务层要布尔就自己转，别指望驱动映射。

## 日期和 JSON 列要注意什么？

- 日期没有原生类型，声明 `Date` 会与运行时字符串不符;
- JSON 存 `text`，读取要装 `ParseJSONResultsPlugin`;
- 具体写法与 `json_extract` 用法见 [SQLite 日期与 JSON 列](./030-SQLite日期与JSON.md)。

## 这些差异怎么在代码里固化？

- 在 `types.ts` 里按运行时真实类型声明，见 [列类型包装](../010-快速上手/030-列类型包装.md);
- 需要自动化时用 `kysely-codegen` 生成，见 [生成数据库类型](../050-进阶/050-生成数据库类型.md)。
