---
id: 6fbd2794-2ca7-429b-a23d-ccfdb6a27f5e
---

# Drizzle ORM 初学者学习手册

## 完成标准

### 学完后应能做什么

- 定位: 能说明 Drizzle ORM 是 thin typed layer over SQL, 不是要求项目围绕它重构的 data framework;
- 建模: 能用 dialect-specific schema API 定义 table、column、constraint、foreign key 和 TypeScript 类型;
- 连接: 能按 driver/runtimes 选择 `drizzle()` import path, 并理解 Drizzle 通过 database driver 执行 SQL;
- 查询: 能用 SQL-like API 写 `select` / `insert` / `update` / `delete` / `join` / aggregation;
- 关系: 能区分 database foreign keys 与 Drizzle soft relations, 并用 RQB 查询 nested relational data;
- 迁移: 能选择 `pull` / `push` / `generate` + `migrate` 等 Drizzle Kit 工作流;
- 边界: 能识别 raw SQL、migration、事务、生产数据库、未加 `where` 的 update/delete 等高风险点;

### 资料基准

- 来源: 本地 Drizzle 官方 docs snapshot, `references/source-docs/`;
- 快照日期: 2026-05-30;
- 必读快照: `overview.mdx`, `sql-schema-declaration.mdx`, `connect-overview.mdx`, `data-querying.mdx`, `select.mdx`, `insert.mdx`, `update.mdx`, `delete.mdx`, `operators.mdx`, `joins.mdx`, `relations-v2.mdx`, `rqb-v2.mdx`, `migrations.mdx`, `kit-overview.mdx`, `drizzle-config-file.mdx`;
- 额外补充: `transactions.mdx`, `sql.mdx`, 用于覆盖事务与 raw SQL;

## 定位与心智模型

### Drizzle 是什么

#### 本质

- Drizzle ORM: 面向 TypeScript 的 headless ORM, 提供 schema declaration、type-safe query builder、relational query API 和 opt-in tooling;
- Headless: 不强制项目结构、运行时框架、repository pattern 或 code generation 生命周期;
- SQL-like: API 尽量贴近 SQL 语义, 已会 SQL 的人学习成本较低;
- Relational API: 通过 `db.query.*` 查询 nested relational data, 减少手写 join mapping;
- Serverless-ready: 通过各类 database driver 原生连接数据库, 适合 edge/serverless/database-as-a-service 场景;

#### 分层模型

```text
Application code
  -> Drizzle schema/types
  -> Drizzle query builder / relational query builder
  -> Database driver
  -> SQL database
```

- `schema`: TypeScript 中的 database shape, 服务于 type inference、query API 和 Drizzle Kit migration diff;
- `db`: `drizzle()` 初始化后的 database client, 持有 driver client 与 query methods;
- `drizzle-kit`: CLI, 负责 schema diff、migration 文件、database introspection、direct push、Studio 等;
- `relations`: 应用层 soft relations, 让 RQB 知道表之间如何组合 nested result;
- `foreign keys`: 数据库层 constraints, 由数据库在 `insert` / `update` / `delete` 时强制检查;

#### Drizzle 与传统 ORM 对比

| 维度       | Drizzle                                 | 常见 data framework 风格 ORM          |
| ---------- | --------------------------------------- | ------------------------------------- |
| 查询表达   | SQL-like + RQB                          | 自定义 abstraction 层较厚             |
| 项目结构   | 不强制                                  | 往往强制 model/service/migration 约定 |
| 类型来源   | TypeScript schema 推断                  | 可能依赖 codegen 或 runtime metadata  |
| SQL 可见性 | 易推导生成 SQL                          | 可能需要额外日志或解释                |
| 关系查询   | opt-in relations                        | 通常 model relation 是核心抽象        |
| 迁移策略   | database-first 与 codebase-first 都支持 | 常绑定单一迁移工作流                  |

### 什么时候用哪种 API

#### SQL-like Query Builder

- 场景: 明确知道要生成什么 SQL, 需要 join、aggregation、CTE、subquery、custom SQL、精细分页;
- 优点: SQL 心智负担低, generated SQL 容易推导, 适合性能敏感查询;
- 边界: nested result 需要自己 mapping, 尤其是一对多和多对多结果;

#### Relational Query Builder

- 场景: 需要 `users -> posts -> comments` 这类 nested object/array result;
- 优点: 单个 SQL statement 输出, 避免多次 roundtrip 和手写 join aggregation;
- 前提: 已定义 `defineRelations()` 并在 `drizzle()` 初始化时传入 `relations`;
- 边界: `extras` 不支持 aggregation, 复杂统计仍优先用 SQL-like query;

## 项目结构与安装连接

### 推荐目录

```text
project/
├── drizzle.config.ts          # Drizzle Kit config
├── drizzle/                   # generated SQL migrations and snapshots
├── src/
│   └── db/
│       ├── client.ts          # drizzle() database client
│       ├── schema.ts          # small project schema entry
│       ├── relations.ts       # defineRelations(), optional split
│       ├── schema/            # large project table files
│       └── queries/           # reusable query functions
└── package.json
```

- 小项目: 一个 `src/db/schema.ts` 足够;
- 中大型项目: `src/db/schema/*.ts` 分表拆分, 通过 barrel export 或 glob 给 Drizzle Kit;
- 必须导出: 使用 Drizzle Kit migration diff 的 table、enum、schema、view 等 model 必须 export;
- 分层建议: schema、client、relations、query code、migration config 分开, 降低耦合;

### 安装依赖

#### PostgreSQL 示例

```shell
npm install drizzle-orm pg
npm install -D drizzle-kit
```

- `drizzle-orm`: runtime query library;
- `drizzle-kit`: migration/introspection/studio CLI;
- `pg`: node-postgres driver, 具体 driver 按数据库和运行时选择;

#### 常见 driver import path

| 场景                       | `drizzle()` import path       | 说明                        |
| -------------------------- | ----------------------------- | --------------------------- |
| PostgreSQL + node-postgres | `drizzle-orm/node-postgres`   | Node.js 服务端常见选择      |
| Neon HTTP                  | `drizzle-orm/neon-http`       | serverless HTTP driver      |
| Neon WebSocket             | `drizzle-orm/neon-serverless` | serverless websocket driver |
| Vercel Postgres            | `drizzle-orm/vercel-postgres` | Vercel 数据库集成           |
| PlanetScale                | `drizzle-orm/planetscale`     | MySQL serverless driver     |
| Cloudflare D1              | `drizzle-orm/d1`              | Cloudflare Workers/D1       |
| Bun SQLite                 | `drizzle-orm/bun-sqlite`      | Bun runtime                 |
| Expo SQLite                | `drizzle-orm/expo-sqlite`     | React Native/Expo           |

### 连接数据库

#### Node PostgreSQL 最小示例

```typescript
// src/db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./relations";

export const db = drizzle({
  connection: process.env.DATABASE_URL,
  casing: "snake_case",
  relations,
});
```

- `connection`: 连接字符串或 driver-specific connection options;
- `casing: "snake_case"`: TypeScript camelCase key 自动映射到 database snake_case column;
- `relations`: 使用 RQB 时传入, 只写 SQL-like query 时不是必需;
- `db.$client`: 需要访问底层 driver client 时可用;

#### URL 结构

```text
postgresql://user:password@host:5432/database
             └──┘ └──────┘ └──┘      └──────┘
              role password hostname database
```

- 密钥边界: 不把 database URL 写进代码或提交到仓库;
- 环境边界: local/dev/staging/prod 使用不同 config 或不同 env var;
- 权限边界: migration 用户与 runtime 用户可分离, runtime 用户不一定需要 DDL 权限;

## Schema Declaration

### Dialect-specific builders

#### 为什么没有通用 table API

- 原因: PostgreSQL、MySQL、SQLite、SingleStore、MSSQL 等 dialect 的 column type、constraint、DDL 差异明显;
- 规则: table builder 与 column builder 必须来自对应 dialect package;
- 结果: schema 越贴近真实 database dialect, query/migration 类型越准确;

```typescript
// PostgreSQL
import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const pgUsers = pgTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
});

// MySQL
import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const mysqlUsers = mysqlTable("users", {
  id: int().primaryKey().autoincrement(),
  name: varchar({ length: 255 }).notNull(),
});

// SQLite
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

export const sqliteUsers = sqliteTable("users", {
  id: sqliteInteger().primaryKey({ autoIncrement: true }),
  name: sqliteText().notNull(),
});
```

### Table 与 column 命名

#### TypeScript key 等于 database key

```typescript
export const users = pgTable("users", {
  id: integer(),
  first_name: text(),
});
```

```sql
select "id", "first_name" from "users";
```

#### TypeScript key 使用 column alias

```typescript
export const users = pgTable("users", {
  id: integer(),
  firstName: text("first_name"),
});
```

```sql
select "id", "first_name" from "users";
```

- 结论: TypeScript key 决定代码访问方式, column alias 决定真实数据库列名;
- 初学建议: 项目统一 `camelCase in TS` + `snake_case in DB`, 并在 `drizzle()` 使用 `casing: "snake_case"`;

### 常用 column modifiers

| Modifier                            | 含义                | 典型场景              |
| ----------------------------------- | ------------------- | --------------------- |
| `.primaryKey()`                     | 主键                | `id`                  |
| `.notNull()`                        | 非空约束            | required field        |
| `.unique()`                         | 唯一约束            | email、slug           |
| `.default(value)`                   | 数据库默认值        | status、role          |
| `.defaultNow()`                     | 当前时间默认值      | `createdAt`           |
| `.$default(fn)` / `.$defaultFn(fn)` | runtime 生成默认值  | cuid、slug            |
| `.references(() => table.id)`       | foreign key         | authorId、postId      |
| `.$type<T>()`                       | TypeScript 类型收窄 | SQLite enum-like text |

### 类型推断

```typescript
export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text().notNull(),
  email: text().notNull().unique(),
  age: integer(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- `$inferSelect`: 查询返回行类型, 包含 nullable 信息;
- `$inferInsert`: insert 入参类型, 自动考虑 default、generated column、nullable column;
- 边界: TypeScript 类型不是 runtime validation, HTTP request/body/env 仍需 Zod/Valibot 等校验;

### 实战 schema 示例

```typescript
// src/db/schema.ts
import { defineRelations } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

export const users = p.pgTable("users", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: p.text().notNull(),
  email: p.text().notNull().unique(),
  createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const posts = p.pgTable(
  "posts",
  {
    id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
    title: p.text().notNull(),
    content: p.text().notNull(),
    authorId: p
      .integer("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [p.index("posts_author_id_idx").on(table.authorId)],
);

export const comments = p.pgTable(
  "comments",
  {
    id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
    postId: p
      .integer("post_id")
      .notNull()
      .references(() => posts.id),
    authorId: p
      .integer("author_id")
      .notNull()
      .references(() => users.id),
    body: p.text().notNull(),
    createdAt: p.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    p.index("comments_post_id_idx").on(table.postId),
    p.index("comments_author_id_idx").on(table.authorId),
  ],
);

export const relations = defineRelations({ users, posts, comments }, (r) => ({
  users: {
    posts: r.many.posts(),
    comments: r.many.comments(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
    comments: r.many.comments(),
  },
  comments: {
    post: r.one.posts({
      from: r.comments.postId,
      to: r.posts.id,
    }),
    author: r.one.users({
      from: r.comments.authorId,
      to: r.users.id,
    }),
  },
}));
```

- `references()`: 生成/表达 database-level foreign key constraint;
- `defineRelations()`: 告诉 RQB 如何 nested query;
- `index()`: relation query 常用 join/filter column 应建索引;
- `generatedAlwaysAsIdentity()`: PostgreSQL identity column, insert 时通常不传 id;

### Schema 文件组织

#### 单文件

```text
src/db/schema.ts
```

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
});
```

#### 多文件

```text
src/db/schema/
├── users.ts
├── posts.ts
├── comments.ts
└── index.ts
```

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
});
```

- 规则: Drizzle Kit 会递归读取 schema folder 中导出的 Drizzle models;
- 风险: 未 export 的 table/enum/view 不参与 migration diff;

## SQL-like Query

### 查询主线

#### Basic select

```typescript
const rows = await db.select().from(users);
```

```sql
select "id", "name", "email", "created_at" from "users";
```

- Drizzle 行为: 显式列出 columns, 不生成 `select *`;
- 类型推断: 返回类型来自 table schema, nullable column 会被推成 `T | null`;

#### Partial select

```typescript
const rows = await db
  .select({
    id: users.id,
    lowerEmail: sql<string>`lower(${users.email})`,
  })
  .from(users);
```

- selection object: 决定返回 object shape;
- `sql<string>`: 只告诉 TypeScript 期望类型, 不做 runtime cast;
- runtime 转换: 需要 `.mapWith(Number)` 或 column decoder;

#### Filters

```typescript
import { and, eq, gt, ilike, inArray, isNotNull, or } from "drizzle-orm";

const rows = await db
  .select()
  .from(posts)
  .where(
    and(
      gt(posts.id, 10),
      or(ilike(posts.title, "Drizzle%"), inArray(posts.authorId, [1, 2, 3])),
      isNotNull(posts.createdAt),
    ),
  );
```

| Operator                 | SQL 语义                  | 用法                              |
| ------------------------ | ------------------------- | --------------------------------- |
| `eq(a, b)`               | `a = b`                   | 等值                              |
| `ne(a, b)`               | `a <> b`                  | 不等                              |
| `gt` / `gte`             | `>` / `>=`                | 大于/大于等于                     |
| `lt` / `lte`             | `<` / `<=`                | 小于/小于等于                     |
| `isNull` / `isNotNull`   | `IS NULL` / `IS NOT NULL` | null 判断                         |
| `inArray` / `notInArray` | `IN` / `NOT IN`           | 数组或 subquery                   |
| `between` / `notBetween` | `BETWEEN`                 | 范围                              |
| `like` / `ilike`         | `LIKE` / `ILIKE`          | 模糊匹配, `ilike` 主要 PostgreSQL |
| `and` / `or` / `not`     | boolean composition       | 组合条件                          |
| `exists` / `notExists`   | subquery existence        | 子查询存在判断                    |

#### Dynamic filters

```typescript
import type { SQL } from "drizzle-orm";
import { and, gt, ilike } from "drizzle-orm";

const searchPosts = async (params: { term?: string; minId?: number }) => {
  const filters: SQL[] = [];

  if (params.term) {
    filters.push(ilike(posts.title, `${params.term}%`));
  }

  if (params.minId) {
    filters.push(gt(posts.id, params.minId));
  }

  return db
    .select()
    .from(posts)
    .where(and(...filters));
};
```

- 条件缺省: `.where(undefined)` 可用于可选条件;
- 安全性: operator 和 `sql` template 中的动态值会 parameterize;
- 边界: 不要把用户输入拼进 `sql.raw()`;

### 排序、分页、聚合

#### Order / limit / offset

```typescript
import { asc, desc } from "drizzle-orm";

const page = await db
  .select()
  .from(posts)
  .where(gt(posts.id, 0))
  .orderBy(desc(posts.createdAt), asc(posts.id))
  .limit(20)
  .offset(40);
```

- offset pagination: 简单, 大 offset 时性能可能下降;
- cursor pagination: 使用稳定排序列和 `where(gt(id, cursor))`;
- MSSQL: `offset` / `fetch` 是 `order by` 的一部分, 需要先 `orderBy()`;

#### Aggregation

```typescript
import { count, eq, gt } from "drizzle-orm";

const rows = await db
  .select({
    authorId: posts.authorId,
    postsCount: count(posts.id),
  })
  .from(posts)
  .groupBy(posts.authorId)
  .having(({ postsCount }) => gt(postsCount, 1));
```

- `groupBy`: selecting aggregation + ordinary column 时必须考虑;
- `count()`: Drizzle helper 会做常用 runtime mapping;
- 原始 `count(*)`: PostgreSQL 返回 `bigint`, MySQL 返回 `decimal`, 可能以 string 表达;

### Insert

#### 单行与多行

```typescript
type NewUser = typeof users.$inferInsert;

const createUser = async (user: NewUser) => {
  return db.insert(users).values(user).returning({
    id: users.id,
    email: users.email,
  });
};

await db.insert(users).values([
  { name: "Ada", email: "ada@example.com" },
  { name: "Linus", email: "linus@example.com" },
]);
```

- `returning()`: PostgreSQL、SQLite、CockroachDB 支持, MySQL 不支持 native `RETURNING`;
- MySQL `$returningId()`: 自动返回 autoincrement 或 `$defaultFn()` 生成的 primary key;
- insert type: 首选 `typeof table.$inferInsert`;

#### Upsert

```typescript
await db
  .insert(users)
  .values({ id: 1, name: "Ada", email: "ada@example.com" })
  .onConflictDoUpdate({
    target: users.id,
    set: { name: "Ada Lovelace" },
  });
```

- PostgreSQL/SQLite: `onConflictDoNothing()` / `onConflictDoUpdate()`;
- MySQL/SingleStore: 使用 `onDuplicateKeyUpdate()`;
- composite key: conflict target 可传 column array;

### Update

```typescript
import { eq, sql } from "drizzle-orm";

await db
  .update(users)
  .set({
    name: "Ada Lovelace",
    updatedAt: sql`now()`,
  })
  .where(eq(users.id, 1));
```

- `set({ key: undefined })`: `undefined` 会被忽略;
- 设置 `null`: 必须显式传 `null`;
- `returning()`: PostgreSQL、SQLite、CockroachDB 支持;
- `limit()` / `orderBy()`: 支持情况取决于 dialect;
- 高风险: 不加 `where` 的 update 会影响整张表;

### Delete

```typescript
await db.delete(users).where(eq(users.id, 1)).returning({
  deletedId: users.id,
});
```

- 删除全表: `await db.delete(users)` 会删除所有 rows;
- `returning()`: PostgreSQL、SQLite、CockroachDB 支持;
- 高风险: 生产代码中 delete/update query 应尽量封装 guard 或审查;

### CTE 与 subquery

```typescript
const activeUsers = db
  .$with("active_users")
  .as(db.select().from(users).where(isNotNull(users.email)));

const rows = await db.with(activeUsers).select().from(activeUsers);
```

```typescript
const latestPosts = db
  .select({ id: posts.id, authorId: posts.authorId })
  .from(posts)
  .orderBy(desc(posts.createdAt))
  .limit(10)
  .as("latest_posts");

const rows = await db
  .select()
  .from(users)
  .leftJoin(latestPosts, eq(users.id, latestPosts.authorId));
```

- CTE alias: 选择 arbitrary SQL field 时必须 `.as("name")`, 否则字段可能变成 `DrizzleTypeError`;
- subquery: `.as("alias")` 后可像 table 一样用于 `from` 或 `join`;

## Joins

### Join 类型与 nullability

| API                  | SQL                 | 返回类型重点                       |
| -------------------- | ------------------- | ---------------------------------- |
| `.innerJoin()`       | `INNER JOIN`        | 两侧都非空                         |
| `.leftJoin()`        | `LEFT JOIN`         | 右侧 nullable                      |
| `.rightJoin()`       | `RIGHT JOIN`        | 左侧 nullable                      |
| `.fullJoin()`        | `FULL JOIN`         | 两侧都 nullable                    |
| `.crossJoin()`       | `CROSS JOIN`        | 笛卡尔积, 两侧非空                 |
| `.leftJoinLateral()` | `LEFT JOIN LATERAL` | subquery 可引用左表, 右侧 nullable |

```typescript
const rows = await db.select().from(users).leftJoin(posts, eq(users.id, posts.authorId));
```

- 类型推断: left join 后 `posts` object 是 `{ ... } | null`;
- partial select: 选择右表单个 field 时该 field 会是 `T | null`;
- nested select object: 可让整块 nested object nullable, 避免每个 field 都 `| null`;

```typescript
const rows = await db
  .select({
    userId: users.id,
    post: {
      id: posts.id,
      title: posts.title,
      titleLength: sql<number>`length(${posts.title})`,
    },
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));
```

### Self join

```typescript
import { alias, eq } from "drizzle-orm";

const inviter = alias(users, "inviter");

const rows = await db.select().from(users).leftJoin(inviter, eq(inviter.id, users.invitedBy));
```

- `alias()`: 同一 table 多次出现在 query 中必须使用 alias;
- 常见场景: user inviter、category parent、employee manager;

### 一对多结果 mapping

```typescript
type User = typeof users.$inferSelect;
type Post = typeof posts.$inferSelect;

const rows = await db
  .select({ user: users, post: posts })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));

const mapped = rows.reduce<Record<number, { user: User; posts: Post[] }>>((acc, row) => {
  if (!acc[row.user.id]) {
    acc[row.user.id] = { user: row.user, posts: [] };
  }

  if (row.post) {
    acc[row.user.id].posts.push(row.post);
  }

  return acc;
}, {});
```

- SQL-like join: 返回 flat rows 或按 select object 映射的 rows;
- nested result: 若主要目标是 nested data, 优先评估 RQB;

## Relations 与 Relational Query Builder

### Soft relations vs foreign keys

#### 核心区别

| 概念                | 层级                | 作用                                               | 是否改变 database schema |
| ------------------- | ------------------- | -------------------------------------------------- | ------------------------ |
| `references()`      | database            | 约束 insert/update/delete 的 referential integrity | 是                       |
| `defineRelations()` | application/Drizzle | 告诉 RQB 如何关联和嵌套查询                        | 否                       |

- 可同时使用: 推荐业务关键关系同时有 foreign key + relation;
- 可单独使用: 某些数据库或历史 schema 无 foreign key 时, 仍可定义 relations 用于 RQB;
- 误区: `defineRelations()` 不会自动创建 foreign key;

### `one()` 与 `many()`

```typescript
export const relations = defineRelations({ users, posts }, (r) => ({
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
      optional: false,
      alias: "post_author",
    }),
  },
  users: {
    posts: r.many.posts(),
  },
}));
```

- relation key: `author` / `posts` 是 RQB 返回对象中的 key;
- `r.one.users`: 目标是单个 user object;
- `r.many.posts`: 目标是 post array;
- `from`: 当前侧 column;
- `to`: 目标侧 column;
- `optional: false`: 类型层面标记 relation required, 只在确信存在时使用;
- `alias`: 同两张表之间存在多个 relation 时用于消歧;
- `where`: relation definition 中可预定义目标表过滤条件;

### One-to-one

```typescript
export const profileInfo = p.pgTable("profile_info", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: p.integer("user_id").references(() => users.id),
  bio: p.text(),
});

export const relations = defineRelations({ users, profileInfo }, (r) => ({
  users: {
    profileInfo: r.one.profileInfo({
      from: r.users.id,
      to: r.profileInfo.userId,
    }),
  },
}));
```

- nullable 推断: foreign key 在 `profileInfo` 表上时, `user.profileInfo` 可能是 `null`;
- 性能: target foreign key column 应考虑 index;

### One-to-many

```typescript
export const relations = defineRelations({ users, posts, comments }, (r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
    comments: r.many.comments(),
  },
}));
```

- 一侧: `users.id`;
- 多侧: `posts.authorId`;
- 索引建议: 多侧 foreign key column 建 index, 如 `posts_author_id_idx`;

### Many-to-many

```typescript
export const groups = p.pgTable("groups", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: p.text().notNull(),
});

export const usersToGroups = p.pgTable(
  "users_to_groups",
  {
    userId: p
      .integer("user_id")
      .notNull()
      .references(() => users.id),
    groupId: p
      .integer("group_id")
      .notNull()
      .references(() => groups.id),
  },
  (table) => [
    p.primaryKey({ columns: [table.userId, table.groupId] }),
    p.index("users_to_groups_user_id_idx").on(table.userId),
    p.index("users_to_groups_group_id_idx").on(table.groupId),
  ],
);

export const relations = defineRelations({ users, groups, usersToGroups }, (r) => ({
  users: {
    groups: r.many.groups({
      from: r.users.id.through(r.usersToGroups.userId),
      to: r.groups.id.through(r.usersToGroups.groupId),
    }),
  },
  groups: {
    users: r.many.users(),
  },
}));
```

- Junction table: 多对多必须显式建 join table;
- `through()`: RQB v2 中绕过 junction table, 直接把目标表作为 nested result;
- 索引建议: junction 两个 foreign key 各自建 index, 常用方向可加 composite index;

### RQB 初始化与基本查询

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./relations";

const db = drizzle({
  connection: process.env.DATABASE_URL,
  relations,
});

const usersWithPosts = await db.query.users.findMany({
  with: {
    posts: true,
  },
});
```

- `findMany()`: 返回 array;
- `findFirst()`: 自动添加 `limit 1`;
- `with`: include related entities;
- nested `with`: 可继续 include 深层 relations;
- 重要行为: Drizzle RQB 输出单个 SQL statement;

### RQB columns

```typescript
const postsList = await db.query.posts.findMany({
  columns: {
    id: true,
    title: true,
  },
  with: {
    comments: {
      columns: {
        authorId: false,
      },
    },
  },
});
```

- partial select: 在 query level 生效, 不会从数据库传输额外 columns;
- true + false 同时出现: true include 优先, false 会被忽略;
- `columns: {}`: 可只返回 relation, 不返回当前 table columns;

### RQB filters

```typescript
const postsList = await db.query.posts.findMany({
  where: {
    id: { gt: 10 },
    OR: [{ title: { like: "Drizzle%" } }, { title: { ilike: "ORM%" } }],
  },
  with: {
    comments: {
      where: {
        createdAt: { lt: new Date() },
      },
    },
  },
});
```

- object filter: RQB v2 支持 column operators、`AND`、`OR`、`NOT`、`RAW`;
- relation filter: 可按 included relation 过滤父表;
- `RAW`: 用 `(table) => sql\`...\`` 写特殊条件;

### RQB pagination/order/extras

```typescript
const postsList = await db.query.posts.findMany({
  limit: 20,
  offset: 40,
  orderBy: { id: "desc" },
  extras: {
    titleLength: (table, { sql }) => sql<number>`length(${table.title})`,
  },
  with: {
    comments: {
      limit: 3,
      orderBy: { id: "asc" },
    },
  },
});
```

- nested limit/offset: 可用于 `with` 中的 relation;
- order order: 多个 order 条件按添加顺序进入 query;
- extras: 添加 computed fields;
- extras 边界: aggregation 不支持, 统计类需求优先 SQL-like query;

### Prepared statements

```typescript
const prepared = db.query.users
  .findMany({
    limit: sql.placeholder("limit"),
    offset: sql.placeholder("offset"),
    where: {
      id: { eq: sql.placeholder("id") },
    },
    with: {
      posts: {
        limit: sql.placeholder("postsLimit"),
      },
    },
  })
  .prepare("users_with_posts");

const rows = await prepared.execute({
  id: 1,
  limit: 10,
  offset: 0,
  postsLimit: 3,
});
```

- 作用: 重复执行的查询可减少 database parse/plan 成本;
- PostgreSQL: 可命名 prepared statement;
- MySQL/SQLite: 通常不需要传 statement name;

## Migrations 与 Drizzle Kit

### Migration 心智模型

#### Database-first

- Source of truth: 数据库 schema;
- Drizzle 用法: `drizzle-kit pull` 从数据库 introspect 生成 TypeScript schema;
- 场景: 已有数据库、DBA/外部工具管理 DDL、从 legacy database 接入 Drizzle;

#### Codebase-first

- Source of truth: TypeScript Drizzle schema;
- Drizzle 用法: 通过 `push` 直接同步, 或 `generate` 生成 SQL migration, 再 `migrate` 应用;
- 场景: 新项目、希望 schema under version control、团队 review migration SQL;

### Drizzle Kit 命令

| Command                | 作用                                      | 风险等级                      |
| ---------------------- | ----------------------------------------- | ----------------------------- |
| `drizzle-kit generate` | 根据 schema diff 生成 SQL migration files | 低, 写本地 migration          |
| `drizzle-kit migrate`  | 应用 migration 到 database                | 高, 改真实数据库              |
| `drizzle-kit push`     | 直接把 schema changes push 到 database    | 高, 跳过 migration 文件       |
| `drizzle-kit pull`     | 从 database introspect schema 到 codebase | 中, 可能覆盖/生成 schema 文件 |
| `drizzle-kit check`    | 检查 generated migrations 是否有冲突      | 低                            |
| `drizzle-kit up`       | 升级旧 migration snapshots                | 中                            |
| `drizzle-kit studio`   | 启动 Drizzle Studio 浏览数据库            | 中, 会连接数据库              |
| `drizzle-kit export`   | 输出 SQL representation                   | 低                            |

### 常见工作流选择

#### 个人原型

```shell
npx drizzle-kit push
```

- 优点: 快速;
- 边界: 直接改数据库, 不适合未经确认的生产环境;
- 安全建议: 只用于 local/dev 或明确可重建环境;

#### 团队/生产推荐

```shell
npx drizzle-kit generate
npx drizzle-kit migrate
```

- `generate`: 读取前一次 migration snapshot, 计算 schema diff, 生成 SQL 文件;
- review: 先 review generated SQL, 尤其是 rename/drop/alter column;
- `migrate`: 读取 migration folder 和 database migration history, 只应用未执行 migration;

#### Existing database

```shell
npx drizzle-kit pull
```

- 作用: 从数据库生成 Drizzle schema;
- 注意: 确认 `schemaFilter` / `tablesFilter` / credentials, 避免把无关 schema 拉进项目;

### `drizzle.config.ts`

#### 最小配置

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

#### 扩展配置

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    table: "__drizzle_migrations__",
    schema: "public",
  },
  schemaFilter: ["public"],
  tablesFilter: ["users", "posts", "comments"],
  strict: true,
  verbose: true,
  breakpoints: true,
});
```

| Config              | 作用                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `dialect`           | 数据库 dialect, 如 `postgresql` / `mysql` / `sqlite` / `turso` / `singlestore` / `mssql` |
| `schema`            | schema file/folder glob                                                                  |
| `out`               | migration SQL 与 snapshots 输出目录, 默认 `drizzle`                                      |
| `driver`            | vendor-specific driver, 如 `pglite` / `d1-http` / `aws-data-api`                         |
| `dbCredentials`     | `migrate` / `push` / `pull` 需要的连接信息                                               |
| `migrations`        | migration log table/schema                                                               |
| `introspect.casing` | `pull` 时生成代码 key 的 casing                                                          |
| `tablesFilter`      | 管理指定 table                                                                           |
| `schemaFilter`      | 管理指定 schema                                                                          |
| `extensionsFilters` | 忽略 extension 创建的对象, 如 PostGIS                                                    |
| `entities.roles`    | PostgreSQL roles 管理策略                                                                |
| `strict`            | `push` 时要求确认 SQL                                                                    |
| `verbose`           | 打印 SQL                                                                                 |
| `breakpoints`       | 生成 statement breakpoint, 对 MySQL/SQLite 等有意义                                      |

### Migration 安全边界

- 生产 `push`: 默认视为高风险, 必须确认 credentials、target database、diff SQL;
- 生产 `migrate`: 必须确认 migration 文件已 review, migration history table 指向正确环境;
- `pull`: 可能生成大量 schema code, 需确认 filters 和输出目录;
- destructive diff: rename/drop column/table 可能丢数据, 先备份或手写 migration;
- 多环境: `--config=drizzle-dev.config.ts` / `--config=drizzle-prod.config.ts` 分离;
- CI: `generate` 后检查 diff, `migrate` 只在受控部署阶段执行;

## Transactions 与 raw SQL

### Transactions

#### 基本事务

```typescript
await db.transaction(async (tx) => {
  await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} - 100` })
    .where(eq(accounts.ownerId, 1));

  await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + 100` })
    .where(eq(accounts.ownerId, 2));
});
```

- transaction: 多条 SQL 作为一个 logical unit commit 或 rollback;
- `tx`: 事务内必须使用 transaction client, 不要混用外层 `db`;
- error: callback 抛错通常导致 rollback;

#### rollback 与返回值

```typescript
const remainingBalance = await db.transaction(async (tx) => {
  const [account] = await tx
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.ownerId, 1));

  if (account.balance < 100) {
    tx.rollback();
  }

  await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} - 100` })
    .where(eq(accounts.ownerId, 1));

  return account.balance - 100;
});
```

- `tx.rollback()`: 主动回滚当前 transaction;
- 返回值: transaction callback 可返回业务结果;
- RQB: 事务内可使用 `tx.query.users.findMany({ with: { posts: true } })`;

#### Nested transactions

```typescript
await db.transaction(async (tx) => {
  await tx.update(users).set({ name: "Ada" }).where(eq(users.id, 1));

  await tx.transaction(async (tx2) => {
    await tx2.update(posts).set({ title: "Updated" }).where(eq(posts.id, 10));
  });
});
```

- nested transaction: Drizzle 使用 savepoints;
- dialect config: PostgreSQL/MySQL/SingleStore/CockroachDB 支持 isolation/access mode 选项, SQLite 支持 `deferred` / `immediate` / `exclusive`;

### `sql` operator

#### 参数化 raw fragment

```typescript
import { sql } from "drizzle-orm";

const id = 69;

await db.execute(sql`
  select *
  from ${users}
  where ${users.id} = ${id}
`);
```

```sql
select * from "users" where "users"."id" = $1;
```

- table/column interpolation: 自动转成 dialect-specific escaped identifier;
- value interpolation: 自动转成 placeholder + params;
- SQL injection: 使用 `sql` template 插值动态值时会 parameterize;

#### `sql<T>` 与 `.mapWith()`

```typescript
const rows = await db
  .select({
    lowerEmail: sql<string>`lower(${users.email})`,
    postsCount: sql<number>`count(${posts.id})`.mapWith(Number),
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .groupBy(users.id);
```

- `sql<T>`: TypeScript helper, 不做 runtime mapping;
- `.mapWith(Number)`: 对 driver 返回值做 runtime mapping;
- `.as("alias")`: CTE/subquery 中引用 computed field 时需要 alias;

#### `sql.raw()` 风险

```typescript
const unsafeColumn = "email";

await db.execute(sql.raw(`select ${unsafeColumn} from users`));
```

- `sql.raw()`: 不转义、不参数化, 只适合完全可信的静态 SQL fragment;
- 用户输入: 不得进入 `sql.raw()` string;
- 动态排序/列名: 使用白名单映射到 table column, 不拼字符串;

#### SQL chunk 组合

```typescript
const chunks = [sql`select * from ${users}`, sql`where ${users.id} = ${1}`];

const query = sql.join(chunks, sql.raw(" "));
await db.execute(query);
```

- `sql.fromList()`: 合并 SQL chunks;
- `sql.join()`: 用 separator 合并 chunks;
- `sql.append()`: 在已有 SQL object 后追加;
- `sql.empty()`: 从空 SQL object 开始动态构造;

## 安全边界与常见误区

### 安全边界清单

- Database credentials: 放在 env/secret manager, 不提交到 repository;
- Runtime validation: Drizzle 类型不校验 HTTP input, 外部输入必须单独 validate;
- Raw SQL: 优先 `sql` template, 谨慎 `sql.raw()`;
- update/delete: 默认不自动要求 `where`, 业务层应封装 guard;
- migration: `push` / `migrate` / `pull` 前确认 target environment;
- `returning()`: dialect-dependent, MySQL 不支持 native `RETURNING`;
- `sql<T>`: 仅 TypeScript 类型提示, 不改变 runtime value;
- `undefined` in update: 会被忽略, 设置空值用 `null`;
- relation: 不等于 foreign key, 不保证数据库完整性;
- RQB extras: 不支持 aggregation, 统计查询用 SQL-like API;
- many-to-many: 必须显式 junction table, 不存在隐藏 join table;
- schema exports: 未 export 的 table/model 不参与 Drizzle Kit diff;

### 常见误区表

| 误区                                      | 正确理解                                             |
| ----------------------------------------- | ---------------------------------------------------- |
| Drizzle 会替我设计数据库                  | Drizzle 表达数据库 schema, 设计仍依赖 SQL/建模能力   |
| `defineRelations()` 会创建 foreign key    | 不会, 它只影响 RQB                                   |
| 有 TypeScript 类型就不用校验输入          | TypeScript 不保护 runtime input                      |
| `sql<number>` 会把 string count 转 number | 不会, 要 `.mapWith(Number)` 或 helper                |
| RQB 一定比 SQL-like query 快              | 不一定, RQB 适合 nested shape, 复杂统计仍用 SQL-like |
| `push` 是 migration 的替代品              | 只适合明确可接受 direct schema sync 的环境           |
| MySQL 可以 `.returning()`                 | MySQL 用 `$returningId()` 或单独查询                 |
| `db.delete(table)` 会安全删除匹配行       | 没有 `where` 就是删除全表                            |
| 多文件 schema 不需要 export               | Drizzle Kit 需要 import/export 才能 diff             |
| `sql.raw()` 和 `sql`` 一样安全            | `sql.raw()` 不参数化也不转义                         |

## 学习路径

### 第 1 阶段: SQL 与 Drizzle 定位

- 目标: 会读 `select` / `insert` / `update` / `delete` / `join` / `group by` 基础 SQL;
- 练习: 手写一条 SQL, 再用 Drizzle SQL-like API 表达同一条 query;
- 验收: 能解释 Drizzle 生成的 SQL 大致是什么;

### 第 2 阶段: Schema 与类型

- 目标: 能定义 3 张表和基本 constraints;
- 练习: `users`、`posts`、`comments` schema, 加 `createdAt`、foreign key、index;
- 验收: 能从 schema 推导 `User` 与 `NewUser` 类型;

### 第 3 阶段: 连接与 CRUD

- 目标: 能连接本地或 dev database 并执行 CRUD;
- 练习: insert user, select page, update profile, delete draft;
- 验收: 每条写操作都能说清楚是否需要 `where`、是否需要 `returning()`;

### 第 4 阶段: SQL-like 复杂查询

- 目标: 掌握 filters、joins、pagination、aggregation、CTE/subquery;
- 练习: 查询每个 user 的 post count, 查询有 comment 的 latest posts;
- 验收: 能处理 outer join nullability 和 count runtime type;

### 第 5 阶段: Relations 与 RQB

- 目标: 能定义 one-to-one、one-to-many、many-to-many relations;
- 练习: 查询 users with posts and comments, 限制每个 post 最多 3 条 comments;
- 验收: 能解释 relation 与 foreign key 的区别, 能判断何时用 RQB;

### 第 6 阶段: Drizzle Kit

- 目标: 能选择 migration workflow;
- 练习: 修改 schema 后运行 `generate`, review SQL, 在 dev database 上 `migrate`;
- 验收: 能说明 `push`、`generate`、`migrate`、`pull` 的差异和风险;

### 第 7 阶段: Production readiness

- 目标: 能处理 transaction、raw SQL、environment separation、migration safety;
- 练习: 用 transaction 实现转账, 用 `sql` 写 full-text search, 禁止 `sql.raw()` 拼接用户输入;
- 验收: 能列出上线前的 database backup、migration review、credential target、rollback plan;

## 最小可运行学习项目

### 文件结构

```text
src/
└── db/
    ├── client.ts
    ├── schema.ts
    └── queries.ts
drizzle.config.ts
drizzle/
```

### `client.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./schema";

export const db = drizzle({
  connection: process.env.DATABASE_URL,
  casing: "snake_case",
  relations,
});
```

### `schema.ts`

```typescript
import { defineRelations } from "drizzle-orm";
import * as p from "drizzle-orm/pg-core";

export const users = p.pgTable("users", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  name: p.text().notNull(),
  email: p.text().notNull().unique(),
});

export const posts = p.pgTable("posts", {
  id: p.integer().primaryKey().generatedAlwaysAsIdentity(),
  title: p.text().notNull(),
  authorId: p
    .integer("author_id")
    .notNull()
    .references(() => users.id),
});

export const relations = defineRelations({ users, posts }, (r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
  },
}));
```

### `queries.ts`

```typescript
import { eq } from "drizzle-orm";
import { db } from "./client";
import { posts, users } from "./schema";

export const createUser = async (input: typeof users.$inferInsert) => {
  return db.insert(users).values(input).returning({ id: users.id });
};

export const findUserWithPosts = async (id: number) => {
  return db.query.users.findFirst({
    where: { id },
    with: {
      posts: true,
    },
  });
};

export const findPostsByUser = async (userId: number) => {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      authorEmail: users.email,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.authorId, userId));
};
```

### `drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
```

### 常用命令

```shell
npx drizzle-kit generate
npx drizzle-kit migrate
npx drizzle-kit studio
```

- 首次建表: 写 schema -> `generate` -> review SQL -> `migrate`;
- 修改字段: 改 schema -> `generate` -> review rename/drop 风险 -> `migrate`;
- 浏览数据: dev database 可用 `studio`, production 使用前确认权限与审计要求;
