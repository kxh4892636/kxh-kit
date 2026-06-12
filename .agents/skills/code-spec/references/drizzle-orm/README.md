---
name: drizzle-orm
description: Drizzle ORM / Drizzle Kit 官方文档型参考。由 code-spec 按需读取，用于 Drizzle、drizzle-orm、Drizzle Kit、drizzle.config、schema、relations、relational query builder、migrations、push/generate/migrate/pull、seed、数据库连接、PostgreSQL/MySQL/SQLite/Turso/D1/Neon/Supabase 等实现、调试、迁移、评审或解释任务，并优先读取本 reference 打包的官方 docs 快照。
---

# Drizzle ORM Reference

Use this reference for Drizzle ORM and Drizzle Kit work: schema modeling, database connections, SQL-like queries, relational queries, migrations, config files, seeding, validation integrations, and Drizzle-specific troubleshooting.

**Source docs:** https://github.com/drizzle-team/drizzle-orm-docs/tree/main/src/content/docs

## Completion Standard

A Drizzle answer is complete when it:

- Identifies the user's database dialect, runtime/driver, and workflow target when those affect the solution.
- Uses Drizzle's current documented APIs from the bundled source docs instead of relying on memory.
- Produces code that matches the selected dialect import path, e.g. `drizzle-orm/pg-core`, `drizzle-orm/mysql-core`, `drizzle-orm/sqlite-core`, `drizzle-orm/singlestore-core`, `drizzle-orm/gel-core`, or `drizzle-orm/mssql-core`.
- Separates schema definitions, database connection setup, query code, and migration/config code when they belong in different files.
- Calls out assumptions explicitly when the prompt omits dialect, driver, or migration strategy.
- Verifies commands/config against the docs before recommending destructive database operations.

## First Steps

1. Read `references/doc-map.md` to choose the relevant bundled source docs.
2. Read the exact files under `references/source-docs/` before answering detailed API/config questions.
3. If the user asks for the latest release, latest API behavior, package versions, or anything that may have changed after this snapshot, browse official Drizzle sources or npm before finalizing.
4. When modifying a repo, inspect existing schema/config/package patterns first and keep changes consistent with the project.

## Source Docs Layout

The full upstream `src/content/docs` snapshot is included under:

```text
references/source-docs/
```

Important entry points:

| Topic | Read |
| --- | --- |
| Official sidebar / route order | `references/source-docs/_meta.json` |
| Fast routing index | `references/doc-map.md` |
| First install/setup chooser | `references/source-docs/get-started.mdx` and `references/source-docs/get-started/` |
| Schema fundamentals | `references/source-docs/sql-schema-declaration.mdx` |
| Relations fundamentals | `references/source-docs/relations-v2.mdx` |
| Database connections | `references/source-docs/connect-overview.mdx` plus the selected `connect-*.mdx` |
| Query overview | `references/source-docs/data-querying.mdx` |
| SQL-like CRUD | `references/source-docs/select.mdx`, `insert.mdx`, `update.mdx`, `delete.mdx`, `operators.mdx`, `joins.mdx` |
| Relational Query Builder | `references/source-docs/rqb-v2.mdx` |
| Migrations overview | `references/source-docs/migrations.mdx` and `references/source-docs/kit-overview.mdx` |
| Drizzle Kit config | `references/source-docs/drizzle-config-file.mdx` |
| Kit commands | `references/source-docs/drizzle-kit-*.mdx` |
| Column types by dialect | `references/source-docs/column-types/*.mdx` |
| Guides and recipes | `references/source-docs/guides/` |

Use `rg` over `references/source-docs` when a user names a specific function, option, driver, error, or integration.

## Dialect Routing

Use the user's dialect/driver to pick the right docs and imports:

| User context | Prefer docs |
| --- | --- |
| PostgreSQL, Neon, Supabase, Vercel Postgres, PGLite, AWS Data API Postgres | `get-started-postgresql.mdx`, selected `connect-*.mdx`, `column-types/pg.mdx` |
| MySQL, PlanetScale MySQL, TiDB, AWS Data API MySQL | `get-started-mysql.mdx`, selected `connect-*.mdx`, `column-types/mysql.mdx` |
| SQLite, Turso, D1, Bun SQLite, Expo SQLite, React Native SQLite | `get-started-sqlite.mdx`, selected `connect-*.mdx`, `column-types/sqlite.mdx` |
| SingleStore | `get-started-singlestore.mdx`, `column-types/singlestore.mdx` |
| CockroachDB | `get-started-cockroach.mdx`, `column-types/cockroach.mdx` |
| Gel | `get-started-gel.mdx` |
| MSSQL | `get-started-mssql.mdx`, `column-types/mssql.mdx` |

When the dialect is missing, ask only if the choice changes code or commands. Otherwise state a default assumption before showing code.

## Implementation Workflow

For repo changes:

1. Find existing Drizzle files: `drizzle.config.*`, schema files, database client setup, migrations folder, seed files, and package scripts.
2. Check dependencies and versions in the project before choosing import paths or CLI commands.
3. Choose the matching source docs from the tables above.
4. Implement the smallest coherent change: schema first, then db client, then queries, then migration/config/scripts as needed.
5. Run the repo's existing format/type/test checks when the task touches code.
6. For migration changes, avoid applying migrations to a real database unless the user explicitly asks and credentials/environment are clearly intended for that action.

## Drizzle Kit Safety

Treat Drizzle Kit commands as database-affecting operations:

- `generate` creates SQL migration files from schema changes.
- `migrate` applies generated migrations.
- `push` pushes schema changes directly to the database.
- `pull` introspects an existing database into schema files.
- `studio` starts Drizzle Studio.

Before recommending or running `push`, `migrate`, or `pull`, confirm the target config, database credentials source, and environment. Prefer generating or reviewing SQL before applying it when production risk is possible.

## Query Guidance

- Prefer SQL-like Drizzle query APIs for precise SQL control and composable query building.
- Prefer `db.query.*` relational query APIs for nested relational result shapes when relations are declared.
- Use operators from `operators.mdx` (`eq`, `and`, `or`, `inArray`, `exists`, etc.) rather than handwritten SQL when the typed API covers the case.
- Use the `sql`` operator docs for raw fragments, computed fields, custom SQL, or features not directly modeled by the query builder.
- For dynamic query construction, read `dynamic-query-building.mdx` before composing conditional filters.

## Schema Guidance

- Export every table/model needed by Drizzle Kit migration diffing.
- Match TypeScript table builders to the dialect; there is no universal table object.
- Use `casing: 'snake_case'` at Drizzle initialization when the project wants camelCase TypeScript keys mapped to snake_case database columns.
- Keep relation declarations separate from database-level foreign keys in reasoning: relations power Drizzle relational queries, while foreign keys are database constraints.
- For generated columns, RLS, schemas, sequences, views, extensions, and advanced constraints, read the matching source doc before writing code.

## Updating This Skill

The bundled source docs are refreshed from the GitHub docs repository with a cross-platform Node.js script:

```bash
node .agents/skills/code-spec/references/drizzle-orm/scripts/update-source-docs.mjs
```

The script uses git sparse checkout for `src/content/docs`, then replaces `references/source-docs/` and updates `references/snapshot.json`. Then review `references/source-docs/`, `references/doc-map.md`, and this `README.md` against upstream changes. If new major topics appear in `_meta.json`, update the routing tables.
