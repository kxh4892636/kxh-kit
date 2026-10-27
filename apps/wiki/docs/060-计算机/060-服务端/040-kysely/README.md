# Kysely 使用手册（Node + SQLite）

Kysely 是 TypeScript 的 SQL 查询构建器: 类型来自 `Database` 接口，SQL 由链式调用拼出，`better-sqlite3` 负责执行。

本目录只写「怎么用」: 常用流程 + 最小代码。数据访问的分层、事务边界、连接池与迁移上线规矩在 [000-服务端知识](../000-服务端知识/050-数据访问/010-Repository与事务.md)。

## 按顺序读

1. [001-安装与连接](./001-安装与连接.md): 装包、tsconfig、`db` 实例、连通、关库;
2. [002-表结构与类型](./002-表结构与类型.md): `Database` 接口、列包装、`Selectable`/`Insertable`;
3. [003-建表与索引](./003-建表与索引.md): `createTable`、列约束、索引;
4. [004-增删改查](./004-增删改查.md): 一屏跑通 CRUD;
5. [005-查询与过滤](./005-查询与过滤.md): 选列/别名、操作符、`whereRef`、排序分页;
6. [006-动态条件与原生SQL](./006-动态条件与原生SQL.md): `if`/`$if`、`sql` 片段、`compile()`;
7. [007-连接与聚合](./007-连接与聚合.md): join、`exists`、CTE、`group by`;
8. [008-嵌套关联结果](./008-嵌套关联结果.md): `jsonArrayFrom`、`jsonObjectFrom`;
9. [009-写入](./009-写入.md): insert/update/delete、`returning`、批量;
10. [010-冲突与upsert](./010-冲突与upsert.md): `onConflict`、`excluded`;
11. [011-事务](./011-事务.md): `transaction()`、显式事务、保存点、禁忌;
12. [012-迁移](./012-迁移.md): 迁移文件、改表、SQLite 限制;
13. [013-运行迁移与上线](./013-运行迁移与上线.md): `kysely-ctl`、脚本跑迁移、上线规矩;
14. [014-插件与日志](./014-插件与日志.md): 常用插件、`log` 回调。

## 按需回查

- 报错、SQLite 行为差异、WAL 与备份: [015-排障与SQLite差异](./015-排障与SQLite差异.md);
- 表结构与类型不对、结果类型收窄: 见 002 与 015 的类型段。

## 边界

- 示例按 `kysely` 0.28、`better-sqlite3` 12、`kysely-ctl` 0.13 编写，升级前核对官方文档;
- 只覆盖 SQLite 方言; 换 Postgres 时 `returning`、`json_agg`、`onConflict` 的细节要重查。
