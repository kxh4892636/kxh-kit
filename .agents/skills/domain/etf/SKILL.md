---
name: etf
description: ETF 领域开发路由。处理 apps/etf-dashboard、apps/etf-service、ConnectRPC 契约、K 线、行情缓存、红色火箭、GORM 存储、测试、E2E 或交付验证时使用。
---

# ETF

本 skill 只负责把任务路由到唯一事实来源。先判断影响面，只读取适用 reference；跨端契约始终以后端 proto 为源头。

## 应用边界

| 应用 | 路径 | 源码根 | 职责 |
| --- | --- | --- | --- |
| `etf-dashboard` | `apps/etf-dashboard` | `src` | React K 线看板与 Connect Query 消费端 |
| `etf-service` | `apps/etf-service` | `internal` | Go ConnectRPC、行情编排、缓存、存储与外部行情适配 |

两个应用属于仓库根 Git 工作树。仓库工具链与生成规则同时读取 `kxh-awesome` skill；代码变更同时读取 `code-spec` skill。

## 路由表

| 任务 | 必读 reference |
| --- | --- |
| 前端页面、路由、Provider、图表或交互 | `references/frontend/application.md` |
| 前端 Connect transport、Query hook 或生成客户端 | `references/frontend/api.md` |
| 前端结构、命令或生成链路 | `references/frontend/development.md` |
| 后端装配、配置、市场领域、存储或红色火箭 | `references/backend/application.md` |
| proto、Connect handler、错误码或对外 HTTP | `references/backend/api.md` |
| 后端结构、命令或生成链路 | `references/backend/development.md` |
| 跨端改动或契约同步顺序 | `references/development-flow.md` |
| 测试策略、E2E 资产位置或场景晋升 | `references/test.md` |
| 本地门禁、运行态、真实路径或故障重验 | `references/verification.md` |

## 固定边界

- 生成物只从契约或生成脚本更新：`apps/etf-service/gen/**`、`apps/etf-service/docs/index.html`、`apps/etf-dashboard/src/libs/api/gen/**` 不手写。
- `apps/etf-service/data/**` 是运行数据；不要把手工修改数据库文件当作开发步骤。
- 现有 `index.*` 是稳定入口文件名，不重命名。
- 前端消费者不额外验证生成 protobuf 响应或 `VITE_API_BASE_URL`；该领域例外的边界见 `references/frontend/api.md`。
- 测试与交付分别由 `test.md` 和 `verification.md` 持有，其他 reference 不复制命令矩阵或证据规则。
