---
name: coding
description: 体验分开发流程 SOP。用户要求 coding、体验分需求开发、体验分 V10 前端开发、体验分前端接口创建或更新、体验分前端埋点创建更新发送，或需要按 SOP 执行体验分开发时使用。
---

# Coding

## References

Reference 文件命名遵循 `{{功能}}-{{技术栈}}.md`：功能在前，技术栈或适用范围在后，例如 `rule-common.md`、`command-common.md`、`api-fe.md`。

- 体验分 workspace 概述和仓库定位：先读取 [workspace.md](references/workspace.md)，再判断代码、文档、前端、后端或数据服务所在仓库。
- 体验分代码开发通用规范和 TypeScript 规范：先读取 [rule-common.md](references/rule-common.md)，再编写或修改 JS/TS 代码。
- 体验分前端常用命令：先读取 [command-common.md](references/command-common.md)，再执行启动、构建、依赖、BAM 或静态检查命令。
- 体验分 V10 前端架构或边界判断：先读取 [v10-architecture-fe.md](references/v10-architecture-fe.md)，再改动 H5/PC `src/v10` 或体验分 Kit 前端代码。
- 体验分 V10 前端组件开发：先读取 [v10-component-fe.md](references/v10-component-fe.md)，再新增或重构页面、feature、common 或 Kit 组件。
- 体验分 V9 迁移 V10 或 V10 开发门禁：先读取 [v10-migration-fe.md](references/v10-migration-fe.md)，再迁移历史代码或提交 V10 改动。
- 体验分前端接口创建或更新：先读取 [api-fe.md](references/api-fe.md)，再新增 BAM、Kit API hook、导出或端应用消费代码。
- 体验分前端埋点创建、更新或发送：先读取 [tracking-fe.md](references/tracking-fe.md)，再新增事件、字段、公共参数或调用埋点发送入口。
