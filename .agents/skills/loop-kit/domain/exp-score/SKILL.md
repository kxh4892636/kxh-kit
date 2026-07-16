---
name: exp-score
description: 体验分开发与交付 SOP。用户处理体验分 V10、前端接口、接口 Mock、埋点、E2E 验收或交付验证时使用。
---

# Exp Score

本 skill 是体验分领域 profile；按任务分支加载下列项目拓扑、开发边界、命令和验收参数。

## References

- 仓库定位：读取 [workspace.md](references/workspace.md)，再判断代码、文档、前端、后端或数据服务所在仓库。
- JS/TS 开发：读取 [rule-common.md](references/rule-common.md)，再编写或修改代码。
- 前端命令：读取 [command-common.md](references/command-common.md)，再执行启动、构建、依赖、BAM 或静态检查命令。
- V10 架构：读取 [v10-architecture-fe.md](references/v10-architecture-fe.md)，再改动 H5/PC `src/v10` 或体验分 Kit。
- V10 组件：读取 [v10-component-fe.md](references/v10-component-fe.md)，再新增或重构 page、feature、common 或 Kit 组件。
- V9 → V10 迁移与门禁：读取 [v10-migration-fe.md](references/v10-migration-fe.md)，再迁移历史代码或提交 V10 改动。
- 前端接口：读取 [api-fe.md](references/api-fe.md)，再新增 BAM、Kit API hook、导出或端应用消费代码。
- 前端接口 Mock：创建、更新或补充体验分接口响应时，读取 [mock-fe.md](references/mock-fe.md)，先选择回归或需求流程，再按流程 × 接口 × 场景矩阵采集、落盘和校验。完成标准：每个目标响应唯一落盘，文件可解析，且与来源的差异仅来自已记录的脱敏。
- 前端埋点：读取 [tracking-fe.md](references/tracking-fe.md)，再新增事件、字段、公共参数或发送调用。
- E2E：先读取 [e2e-common.md](references/e2e-common.md) 注入体验分路径、路由、平台和商家态，再调用 `/e2e` 的对应分支。完成标准：通用验收资产或执行记录包含 profile 要求的全部体验分维度。
- 交付验证：先读取 [verification-common.md](references/verification-common.md) 建立体验分门禁链，再调用 `/verifying`。完成标准：前后端、部署、商家态与真实路径中的所有适用阶段均有证据结论。
