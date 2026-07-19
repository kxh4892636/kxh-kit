---
id: cc8efd9e-8e8d-4db5-a07f-42f3ec5e0f9b
---

# Electron 中的 node:sqlite 运行时

## 分层位置

| 层            | Lithe 技术                  | 职责                                   |
| ------------- | --------------------------- | -------------------------------------- |
| SQLite driver | Electron 内置 `node:sqlite` | 连接、SQL、事务和生命周期              |
| 类型化查询    | Drizzle ORM RC              | schema 映射与类型安全 query            |
| 领域接口      | `AppDatabase`               | preferences 与 window state repository |

- 核心边界: `node:sqlite` 是 driver，Drizzle 是其上的数据访问层;
- 所有权: 连接只由 main 持有，renderer 不能直接访问数据库;
- 文件位置: `app.getPath('userData')/lithe.db`;

## 为什么选择 node:sqlite

- 内置性: driver 随 Node.js/Electron 提供，不再安装 `better-sqlite3` 原生扩展;
- 打包收益: 不需要为 Electron ABI 单独 rebuild SQLite binding;
- 跨平台收益: Windows、Linux、macOS 使用 Electron 自带的同一能力;
- API 形态: `DatabaseSync` 的操作是同步执行;
- 状态: Node 官方当前将 `node:sqlite` 标为 release candidate;

## 连接初始化

```ts
const sqlite = new DatabaseSync(databasePath, { timeout: 5_000 });
sqlite.exec(
  "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; " +
    "PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;",
);
const database = drizzle({ client: sqlite });
```

- `timeout`: 打开连接时配置锁等待时间;
- `drizzle({ client })`: 复用已配置的 `DatabaseSync`;
- 连接失败: 异常进入 main 启动失败路径，不创建空白窗口;
- 退出: `before-quit` 调用 `sqlite.close()` 释放文件句柄;

## PRAGMA

| PRAGMA               | 作用                           | 取舍                       |
| -------------------- | ------------------------------ | -------------------------- |
| `journal_mode=WAL`   | 写入追加到 WAL，读写并发更友好 | 产生 `-wal` 与 `-shm` 文件 |
| `foreign_keys=ON`    | 启用外键约束                   | 每个连接都应显式启用       |
| `busy_timeout=5000`  | 锁冲突时最多等待 5 秒          | 不能解决长期事务           |
| `synchronous=NORMAL` | WAL 下减少部分同步开销         | 极端断电保证弱于 FULL      |

## 同步 API 的边界

- 优点: 小型本地设置读写简单，调用链无需 Promise;
- 风险: SQL 在 main 事件循环中同步执行，慢查询会冻结窗口管理和 IPC;
- 当前适用: 单行 preference、单行 window state 与短 migration;
- 扩展策略: 大批量导入、复杂分析或高频日志应批处理、分块或移入 utility process;
- WAL 不是异步化: WAL 改善数据库并发，不会让同步 JavaScript 自动进入后台;

## 数据路径边界

- `userData`: 可写、按用户隔离、跨应用重启保留;
- 安装资源: 应视为只读，不保存数据库文件;
- 测试: 使用临时 `LITHE_USER_DATA_DIR`，避免污染真实数据;
- Git: 忽略 `*.db`、`*.db-wal` 和 `*.db-shm`;
- 备份: 需要同时考虑主文件和 WAL checkpoint 状态;

## 官方资料

- [Node.js SQLite](https://nodejs.org/api/sqlite.html): `DatabaseSync`、同步 API 与模块状态;
- [Drizzle Node SQLite](https://orm.drizzle.team/docs/sqlite/connect-node-sqlite): 使用现有 driver 初始化 Drizzle;
