---
status: completed
blocked_by: []
---

# 工作区配置 CRUD

## 交付

用户通过 `workspace config` 初始化工作区，并完整新增、读取、更新和移除 `workspace.yaml` 中的子仓配置项。

## 范围

- 建立 `config init/add/list/update/remove`，移入旧扁平配置责任，将 add upsert 拆为 add 只创建、update 只更新。
- 以稳定 name 标识配置项；update 至少提供一个 url/path/branch，不支持 rename。
- list 只返回 `workspace.yaml` 中的 `name/url/path/branch`，不混入物化/local 状态。
- update/remove 在配置 path 已物化时拒绝，不级联修改下层资源。
- 建立「workspace root + 配置 path → 子仓克隆绝对路径」单一 resolver。

## 直接依赖

- 无。

## 验收

- [x] CLI 黑盒与配置测试证明：`config init/add/list/update/remove` 完整覆盖配置 CRUD，add 不 upsert，update 不创建，list 不读 local 状态，update/remove 不级联改动已物化资源；并通过 spec 固定的全部 `/verifying` 门禁。

## 交付记录

- 交付物：`workspace config init/add/list/update/remove`、配置 path resolver、等价路径去重、真实 Git 物化门禁及对应 CLI/配置/集成测试。
- 验证证据：变更文件格式/lint/type 通过；全量 `test` 20 files / 256 tests 通过；`build` 通过。完整 `check` 的 lint/type 通过，仓库既有 CRLF checkout 导致 145 个未改文件被 oxfmt 报格式差异，未进行无关批量改写。
- 审查：Standards 与 Spec 双轴审查的 5 项发现均已修复并定向重验。

## 上下文

- [spec](spec.md)
- [现有 workspace config 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-config.ts)
- [ADR-0005](../../../adr/0005-子仓克隆由工作区配置定位.md)

## 下一步

/implement
