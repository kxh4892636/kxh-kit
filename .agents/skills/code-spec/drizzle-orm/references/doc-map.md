# Drizzle ORM Docs Map

This file routes Drizzle tasks to the bundled upstream docs snapshot in `references/source-docs/`.

The complete source content is preserved under `source-docs`; this map is only a navigation layer. If a prompt mentions an exact API, CLI flag, driver, config key, error text, or integration name, search the source snapshot before answering:

```powershell
rg -n "search term" .agents/skills/code-spec/drizzle-orm/references/source-docs
```

## Source Snapshot

- Upstream: `https://github.com/drizzle-team/drizzle-orm-docs/tree/main/src/content/docs`
- Local mirror: `references/source-docs/`
- Created from branch: `main`
- Snapshot date: `2026-05-30`
- File count at creation: `255`
- Source bytes at creation: `1,671,200`

Use `source-docs/_meta.json` as the official sidebar/order of topics.

## Fast Routing

| User asks about | Read these docs first |
| --- | --- |
| "What is Drizzle?", overview, why choose it | `overview.mdx`, `why-drizzle.mdx`, `quick.mdx` |
| Install or first project setup | `get-started.mdx`, `get-started/`, and the dialect-specific `get-started-*.mdx` |
| Existing database setup | matching `get-started/*-existing.mdx`, `drizzle-kit-pull.mdx` |
| New database setup | matching `get-started/*-new.mdx`, `drizzle-kit-generate.mdx`, `drizzle-kit-migrate.mdx` |
| Schema/table declaration | `sql-schema-declaration.mdx` |
| Column types | `column-types/<dialect>.mdx` |
| Indexes, constraints, foreign keys | `indexes-constraints.mdx` |
| Database schemas, sequences, views, extensions | `schemas.mdx`, `sequences.mdx`, `views.mdx`, `extensions/` |
| Relations | `relations-v2.mdx`; use `relations.mdx` only for old API compatibility |
| Relational Query Builder | `rqb-v2.mdx`; use `rqb.mdx` only for old API compatibility |
| SQL-like query builder | `data-querying.mdx`, `select.mdx`, `insert.mdx`, `update.mdx`, `delete.mdx` |
| Filters/operators | `operators.mdx` |
| Joins, aliases, aggregating joined rows | `joins.mdx` |
| Raw SQL, custom fragments, computed fields | `sql.mdx` |
| Dynamic query building | `dynamic-query-building.mdx` |
| Transactions | `transactions.mdx` |
| Batch API | `batch-api.mdx` |
| Read replicas | `read-replicas.mdx` |
| Cache | `cache.mdx` |
| Migrations concepts | `migrations.mdx`, `kit-overview.mdx` |
| Drizzle Kit config | `drizzle-config-file.mdx` |
| Kit commands | `drizzle-kit-generate.mdx`, `drizzle-kit-migrate.mdx`, `drizzle-kit-push.mdx`, `drizzle-kit-pull.mdx`, `drizzle-kit-check.mdx`, `drizzle-kit-up.mdx`, `drizzle-kit-studio.mdx`, `drizzle-kit-export.mdx` |
| Custom/team migrations | `kit-custom-migrations.mdx`, `kit-migrations-for-teams.mdx`, `kit-web-mobile.mdx` |
| Seeding | `seed-overview.mdx`, `seed-functions.mdx`, `seed-limitations.mdx`, `seed-versioning.mdx`, `kit-seed-data.mdx`, `guides/seeding-*.mdx` |
| Row-level security | `rls.mdx` |
| Validation integrations | `zod.mdx`, `valibot.mdx`, `typebox.mdx`, `arktype.mdx`, `effect-schema.mdx` |
| Prisma migration/interop | `prisma.mdx` |
| ESLint plugin | `eslint-plugin.mdx` |
| GraphQL | `graphql.mdx` |
| FAQ and edge cases | `faq.mdx`, `gotchas.mdx`, `goodies.mdx` |

## Dialect And Driver Map

| Dialect / runtime | Setup docs | Connection docs | Column docs |
| --- | --- | --- | --- |
| PostgreSQL | `get-started-postgresql.mdx`, `get-started/postgresql-*.mdx` | `connect-overview.mdx`, `connect-aws-data-api-pg.mdx` when relevant | `column-types/pg.mdx` |
| Neon | `get-started/neon-*.mdx` | `connect-neon.mdx` | `column-types/pg.mdx` |
| Supabase | `get-started/supabase-*.mdx` | `connect-supabase.mdx` | `column-types/pg.mdx` |
| Vercel Postgres | `get-started/vercel-*.mdx` | `connect-vercel-postgres.mdx` | `column-types/pg.mdx` |
| PGLite | `get-started/pglite-*.mdx` | `connect-pglite.mdx` | `column-types/pg.mdx` |
| PlanetScale Postgres | `get-started/planetscale-postgres-*.mdx` | `connect-planetscale-postgres.mdx` | `column-types/pg.mdx` |
| MySQL | `get-started-mysql.mdx`, `get-started/mysql-*.mdx` | `connect-aws-data-api-mysql.mdx` when relevant | `column-types/mysql.mdx` |
| PlanetScale MySQL | `get-started/planetscale-*.mdx` | `connect-planetscale.mdx` | `column-types/mysql.mdx` |
| TiDB | `get-started/tidb-*.mdx` | `connect-tidb.mdx` | `column-types/mysql.mdx` |
| SQLite | `get-started-sqlite.mdx`, `get-started/sqlite-*.mdx` | `connect-node-sqlite.mdx` or selected SQLite driver docs | `column-types/sqlite.mdx` |
| Turso | `get-started/turso-*.mdx`, `get-started/turso-database-*.mdx` | `connect-turso.mdx`, `connect-turso-database.mdx` | `column-types/sqlite.mdx` |
| Cloudflare D1 | `get-started/d1-*.mdx` | `connect-cloudflare-d1.mdx` | `column-types/sqlite.mdx` |
| Cloudflare Durable Objects | `get-started/do-*.mdx` | `connect-cloudflare-do.mdx` | `column-types/sqlite.mdx` |
| Bun SQLite | `get-started/bun-sqlite-*.mdx` | `connect-bun-sqlite.mdx` | `column-types/sqlite.mdx` |
| Bun SQL | `get-started/bun-sql-*.mdx` | `connect-bun-sql.mdx` | selected database dialect docs |
| Expo / React Native SQLite / OP SQLite | matching `get-started/*-*.mdx` | `connect-expo-sqlite.mdx`, `connect-react-native-sqlite.mdx`, `connect-op-sqlite.mdx` | `column-types/sqlite.mdx` |
| SingleStore | `get-started-singlestore.mdx`, `get-started/singlestore-*.mdx` | selected SingleStore setup docs | `column-types/singlestore.mdx` |
| CockroachDB | `get-started-cockroach.mdx`, `get-started/cockroach-*.mdx` | selected Cockroach setup docs | `column-types/cockroach.mdx` |
| Gel | `get-started-gel.mdx`, `get-started/gel-*.mdx` | `connect-overview.mdx` and Gel setup docs | selected Gel docs |
| MSSQL | `get-started-mssql.mdx`, `get-started/mssql-*.mdx` | selected MSSQL setup docs | `column-types/mssql.mdx` |

## Drizzle Kit Command Map

| Command | Purpose | Read |
| --- | --- | --- |
| `drizzle-kit generate` | Generate SQL migration files from schema | `drizzle-kit-generate.mdx` |
| `drizzle-kit migrate` | Apply generated migrations | `drizzle-kit-migrate.mdx` |
| `drizzle-kit push` | Push schema changes directly to DB | `drizzle-kit-push.mdx` |
| `drizzle-kit pull` | Introspect DB schema into Drizzle schema files | `drizzle-kit-pull.mdx` |
| `drizzle-kit check` | Check migrations for conflicts | `drizzle-kit-check.mdx` |
| `drizzle-kit up` | Upgrade snapshots | `drizzle-kit-up.mdx` |
| `drizzle-kit studio` | Start Drizzle Studio | `drizzle-kit-studio.mdx` |
| `drizzle-kit export` | Export SQL | `drizzle-kit-export.mdx` |

## Common Decision Points

- Use `generate` + `migrate` when the project tracks SQL migrations in source control.
- Use `push` only when direct schema sync is acceptable for the target database/environment.
- Use `pull` for existing databases or introspection workflows.
- Use v2 docs (`relations-v2.mdx`, `rqb-v2.mdx`) for new relational query work unless the user is maintaining v1 code.
- Read `gotchas.mdx` and `faq.mdx` when the issue looks like a known Drizzle behavior rather than a syntax question.
- Search `guides/` when the user asks for a recipe such as pagination, count rows, full-text search, upsert, vector search, or default values.
