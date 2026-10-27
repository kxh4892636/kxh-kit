---
id: 0a00294a-3f27-45ea-a702-3fe09bea0b5e
---

# SQLite 并发与运维

## SQLite 的锁是怎么工作的？

- SQLite 没有行级锁，写锁是**库级**：同一时刻只能有一个写事务;
- 默认日志模式下写会阻塞读，读也会阻塞写;
- 并发写冲突表现为 `SQLITE_BUSY: database is locked`，通常是等不到锁超时。

## 怎样让读写不互相阻塞？

- 开 WAL：`journal_mode = WAL`，读拿到快照继续跑，写只锁写;
- 设置忙等待 `timeout`，让并发写排队而不是立刻失败;

```ts
const sqlite = new SQLite("dev.sqlite", { timeout: 5000 });
sqlite.pragma("journal_mode = WAL");

export const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
```

| 参数           | 默认     | 建议                                      |
| -------------- | -------- | ----------------------------------------- |
| `journal_mode` | `delete` | 并发场景改 `WAL`                          |
| `timeout`      | 5000ms   | 按写入峰值调大，如 10000                  |
| `synchronous`  | `FULL`   | WAL 下可降为 `NORMAL`，用一点持久性换吞吐 |

## 长事务为什么危险？

- 一个写事务持有库级写锁，期间其他写入全部排队;
- 事务里夹外部 HTTP 调用、批量循环会放大阻塞;

```ts
// ❌ 事务里做慢操作，写锁一直不释放
await db.transaction().execute(async (trx) => {
  await fetch("https://example.com/slow");
  await trx.insertInto("audit").values({ action: "x" }).execute();
});

// ✅ 先取数据，再开短事务写库
const payload = await fetch("https://example.com/slow");
await db.transaction().execute(async (trx) => {
  await trx.insertInto("audit").values({ action: "ok" }).execute();
});
```

- 事务语义与保存点见 [事务与保存点](../040-事务与迁移/010-事务.md)。

## 备份怎么做？

- 热备份用驱动自带接口，不要在写入时直接 `cp` 文件;

```ts
await sqlite.backup("backup/dev.sqlite");
```

- WAL 模式下库由 `dev.sqlite` + `-wal` + `-shm` 三个文件组成，只拷主文件会丢数据;
- 备份后要验证可打开、可查询，别只看文件大小。

## 上线前核对哪些设置？

- [ ] `PRAGMA foreign_keys` 为 1（better-sqlite3 默认开启）;
- [ ] `journal_mode` 与 `timeout` 匹配并发预期;
- [ ] 迁移在应用启动前执行完，见 [在脚本与 CI 中运行迁移](../040-事务与迁移/080-在脚本与CI中运行迁移.md);
- [ ] 备份任务与恢复演练都有;
- [ ] 类型声明与驱动返回一致，见 [SQLite 类型与运行时差异](./020-SQLite类型与运行时差异.md)。
