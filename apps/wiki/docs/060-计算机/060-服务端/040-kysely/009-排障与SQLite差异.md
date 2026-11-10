---
id: 444de38b-9271-47ef-8d40-e98d01f57e03
anki: true
---

# 排障与 SQLite 差异

## 出问题先做什么？

1. `.compile()` 看真实 SQL 与参数;
2. 同一条 SQL 丢进 `sqlite3` 直接跑;
3. 确认库路径和迁移执行过: `db.introspection.getTables()`;
4. 确认走了索引: `explain query plan`, 出现 `SCAN` 就是全表扫描;

```ts
const q = db.selectFrom("person").select("first_name").where("id", "=", 1).compile();
console.log(q.sql, q.parameters); // select "first_name" from "person" where "id" = ? [ 1 ]
```

## 运行时错误怎么对照处理？

| 报错                              | 处理                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `no such table: xxx`              | 没建表 / 连错库: 跑迁移, 核对库路径                              |
| `no such column: xxx`             | 迁移没跑: 重跑迁移, 核对 `Database`                              |
| `syntax error near ")"`           | 空 `in ()`: 判空或用 `$if`                                       |
| `NOT NULL constraint failed`      | 必填列没给值: 补值或加 `defaultTo`                               |
| `UNIQUE constraint failed`        | 唯一索引冲突: 改用 `onConflict`, 见 [006](./006-写入与upsert.md) |
| `FOREIGN KEY constraint failed`   | 父行不存在: 先写父表, 级联用 `onDelete('cascade')`               |
| `SQLITE_BUSY: database is locked` | 并发写抢锁: 开 WAL、加 `timeout`、缩短事务                       |
| `too many SQL variables`          | 参数超 32766: 分批写入                                           |

- 改了数据却查不出来: 读写不是同一个实例, 或显式事务忘了 `commit()`, 见 [007](./007-事务.md); 确实没匹配到行就用 `executeTakeFirstOrThrow()`;

## SQLite 有哪些必须记住的差异？

| 主题       | 行为                            | 应对                        |
| ---------- | ------------------------------- | --------------------------- |
| `insertId` | `bigint`                        | `Number(...)` 转换          |
| 日期       | 无原生类型, 存 `text`/`integer` | 声明成 `string`             |
| JSON       | 存 `text`, 驱动不自动解析       | 装 `ParseJSONResultsPlugin` |
| 布尔       | 传 `true` 会被驱动拒绝          | 列声明 `number` 或 `0 \| 1` |
| `truncate` | 不支持                          | 用 `delete from`            |
| 并发       | 写锁是库级, 同时只能一个写事务  | 开 WAL + `timeout`          |

## 并发、日志、备份怎么配？

```ts
const sqlite = new SQLite("dev.sqlite", { timeout: 5000 });
sqlite.pragma("journal_mode = WAL");
await sqlite.backup("backup/dev.sqlite"); // 热备份用驱动接口，别 cp 文件
```

- WAL 下库由 `dev.sqlite` + `-wal` + `-shm` 三个文件组成; 只拷主文件会丢数据;
- 日志字段: `level`（判别用）、`query.sql`、`query.parameters`、`queryDurationMillis`、`error`;
- `parameters` 可能含用户数据, 落盘前脱敏; 生产别开全量 `"query"` 日志, 只留 `["query", "error"]`; 只看单条 SQL 用 `.compile()`;
