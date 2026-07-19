---
id: 1518aaca-2c3f-4045-a39e-6f666cfe638e
---

# Drizzle 模式、Repository 与迁移

## Drizzle 的职责

- Drizzle ORM: 把 TypeScript schema 映射为类型安全查询;
- Drizzle Kit: 比较 schema、生成 SQL migration 与 snapshot;
- migration runner: 应用启动时把旧数据库推进到当前 schema;
- 领域接口: 隐藏表名和 query builder，只暴露业务操作;

## schema

- `app_preferences`: 以字符串 key 保存设置，当前使用 `theme`;
- `window_state`: 固定 `id=1` 保存主窗口边界和最大化状态;
- timestamp mode: `timestamp_ms` 在 TypeScript 中映射为 `Date`;
- boolean mode: SQLite integer 映射为 TypeScript boolean;
- source of truth: `src/main/database/schema.ts`;

## migration 资产

```text
drizzle.config.ts
  -> schema: ./src/main/database/schema.ts
  -> out: ./drizzle

drizzle/
└─ 20260719170709_uneven_songbird/
   ├─ migration.sql
   └─ snapshot.json
```

- SQL: 应用实际执行的 schema 变更;
- snapshot: Drizzle Kit 用于比较下一次 schema 变化;
- 提交原则: schema、SQL migration 与 snapshot 一起提交;
- 打包原则: migration 作为 `extraResources` 放入安装资源目录;
- 路径差异: 开发读取仓库 `drizzle/`，生产读取 `process.resourcesPath/drizzle`;

## 启动 migration

```ts
const database = drizzle({ client: sqlite });
migrate(database, { migrationsFolder });
```

- 执行时机: 创建窗口和注册 IPC 之前;
- 成功结果: main 后续代码可假设数据库达到期望 schema;
- 失败策略: 启动失败并显示错误，而不是继续运行未知 schema;
- 代价: migration 必须短小，避免长时间阻塞 main 启动;

## repository 接口

- `preferences.getTheme()`: 查询 theme，不存在或非法时回退 `system`;
- `preferences.setTheme()`: 使用 upsert 写入最新 theme;
- `windowState.get()`: 将数据库记录映射为共享 `WindowState`;
- `windowState.save()`: 使用固定主键 upsert 最新窗口状态;
- `close()`: 应用退出时关闭底层连接;
- 深模块价值: 上层代码不需要知道 SQL、表名和 Drizzle query builder;

## schema 变更流程

1. 修改 `schema.ts`;
2. 运行 `pnpm exec drizzle-kit generate`;
3. 检查新 SQL 与 snapshot;
4. 运行 Node 数据库测试;
5. 使用旧数据库副本验证 migration;
6. 重新打包并确认 migration 位于 resources;

## RC 版本规则

- Lithe 固定 ORM 与 Kit 为同一构建 `1.0.0-rc.4-5d5b77c`;
- 原因: 泛化 `@rc` tag 曾解析为不匹配构建并导致 codegen 运行时错误;
- 检查: 不只看 exit code，还要检查输出中是否存在 `TypeError`;
- 升级: ORM 与 Kit 成对升级，并重新生成、测试 migration;

## 测试目标

- 首次启动能从空数据库执行全部 migration;
- theme 默认值与 upsert 正确;
- window state 最新值覆盖旧值;
- 连接关闭后临时数据库可删除;
- 新版本能从上一版真实数据库升级;

## 官方资料

- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations): schema 与 migration 模型;
- [Drizzle Node SQLite](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite): 同步查询 API;
