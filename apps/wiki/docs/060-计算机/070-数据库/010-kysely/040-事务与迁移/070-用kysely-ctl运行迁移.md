---
id: 9e47eade-8041-4eed-ba6e-a316b424676a
---

# 用 kysely-ctl 运行迁移

## 为什么需要 CLI？

- 迁移代码不需要业务运行时，用命令行跑更合适;
- `kysely-ctl` 提供 `migrate:*`、`seed:*`、`sql` 命令，也能进 CI;
- 不想引 CLI 时用 `Migrator` 自己写脚本，见 [在脚本与 CI 中运行迁移](./080-在脚本与CI中运行迁移.md)。

## 怎样初始化和配置？

```bash
npm i -D kysely-ctl
npx kysely init   # 生成 .config/kysely.config.ts
```

```ts title=".config/kysely.config.ts"
import SQLite from "better-sqlite3";
import { defineConfig } from "kysely-ctl";
import { SqliteDialect } from "kysely";

export default defineConfig({
  dialect: new SqliteDialect({ database: new SQLite("dev.sqlite") }),
  migrations: { migrationFolder: "migrations" },
  seeds: { seedFolder: "seeds" },
});
```

- `dialect` 可以给实例，也可以给方言名 + `dialectConfig`;
- 库文件路径从 `process.env.DB_FILE` 之类取，别写死。

## 常用命令有哪些？

| 命令                                   | 作用                         |
| -------------------------------------- | ---------------------------- |
| `kysely migrate:make <名字>`           | 生成迁移文件（带时间戳前缀） |
| `kysely migrate:latest`                | 执行所有未跑过的迁移         |
| `kysely migrate:up`                    | 只跑下一个未执行迁移         |
| `kysely migrate:down`                  | 撤销最后一个已执行迁移       |
| `kysely migrate:rollback`              | 撤销全部已执行迁移           |
| `kysely migrate:list`                  | 列出已完成与待执行迁移       |
| `kysely seed:make <名字>` / `seed:run` | 生成 / 执行种子数据脚本      |
| `kysely sql "<query>"`                 | 临时执行一条 SQL             |

```bash
npx kysely migrate:make add_pet_age
npx kysely migrate:latest
npx kysely migrate:list
```

```text
ℹ Found 2 migrations:
[ ] 1792673083105_add_age
[✓] 2026-01-01T00-00-00-init
```

## 生成的迁移文件可以直接用吗？

- 只有 `up` 必需，`down` 可删；文件形态见 [编写迁移文件](./030-编写迁移文件.md)。

## 用 CLI 有哪些坑？

- 配置文件默认放在 `.config/` 下，不在项目根目录，找不到配置时先看这里;
- CLI 依赖的 `kysely` 版本与项目里的一致，否则会提示版本不匹配;
- `kysely` 命令来自 `kysely-ctl` 包，别与 `kysely` 包本身混为一谈。

- 需要类型定义与建表写法时，见 [编写迁移文件](./030-编写迁移文件.md)。
