# Kysely 使用手册（Node + SQLite）

Kysely 是 TypeScript 的 SQL 查询构建器。类型来自 `Database` 接口，SQL 由链式调用拼出，`better-sqlite3` 负责执行。

本目录只写「术」: API、默认行为、SQLite 方言差异。为什么表要建索引、事务边界怎么划、迁移怎么上线，去 [000-服务端知识](../000-服务端知识/README.md)。

## 按顺序读

1. [001-安装与连接](./001-安装与连接.md): 装包、tsconfig、`db` 实例、连通、关库；
2. [002-表结构与类型](./002-表结构与类型.md): `Database` 接口、列包装、`Selectable`/`Insertable`、codegen；
3. [003-建表与增删改查](./003-建表与增删改查.md): `createTable`、列约束、索引、一屏 CRUD；
4. [004-查询与过滤](./004-查询与过滤.md): 选列/别名、操作符、`whereRef`、`$if`、`sql` 片段、`compile()`；
5. [005-连接聚合与嵌套结果](./005-连接聚合与嵌套结果.md): join、`exists`、`group by`、`jsonArrayFrom`；
6. [006-写入与upsert](./006-写入与upsert.md): insert/update/delete、`returning`、`onConflict`、批量；
7. [007-事务](./007-事务.md): `transaction()`、显式事务、保存点、禁忌；
8. [008-迁移与运行](./008-迁移与运行.md): 迁移文件、改表、`kysely-ctl`、脚本跑迁移、上线；
9. [009-排障与SQLite差异](./009-排障与SQLite差异.md): 报错对照表、SQLite 差异、WAL 与备份、日志。

## 边界

- 示例按 `kysely` 0.28、`better-sqlite3` 12、`kysely-ctl` 0.13 编写，升级前核对官方文档；
- 只覆盖 SQLite 方言。换 Postgres 时 `returning`、`json_agg`、`onConflict` 的细节要重查。
