---
name: "012-nano-flow代码治理评估"
description: "按功能面盘点 nano-flow 的历史包袱：105 个无用导出、13 处 describe、三套 frontmatter 解析、两套 Plan 扫描等重构方案。"
status: in_progress
related_noted:
  - "005-收敛绑定表生命周期与遗留缺陷"
next_step: "等用户确认重构范围后，按 F1 死代码 → F2 去重 → F3 拆文件 → F4 门禁 的顺序拆 note。"
---

# 012-nano-flow代码治理评估

交付：一份功能层面的重构方案（无用代码、重复实现、同功能多实现），按风险与收益排序。验收：每条都有文件与数量证据；确认范围后拆成可独立验收的 note。

用户已明确：**跨包重复资产（旧 `packages/nano-flow`）忽略**，只看 dsh-toolkit 内部的功能面；目标是清理历史包袱、全方位重构。

## 盘点

### F1 无用代码：301 个导出里 105 个没有生产引用

扫描 `src` 全部 92 个文件：`export` 的 `const/function/class/interface/type` 共 **301** 个，其中 **105** 个在非测试代码里零引用。典型：

- 组件 props 与内部类型被顺手 `export`（`NotesDockProps`、`PanelIconProps`、`UndoButtonProps`、`SessionSnapshotLike`、`InputActionsLike`）；
- `client/contract.ts` 里一整组客户端插槽类型（`ClientSlots`、`ClientSlotComponent`、`ClientSessions`、`ClientConversation`…）没有实现方；
- 只有测试在用的重置函数（`resetRotationFollow`、`clearTombstones`、`resetDrafts`、`applyPendingDraft`）——这类是**合理的**测试钩子，不算包袱，但要与"真死代码"分开处理；
- 若干 `interface` 与常量（`TOOLKIT_STATE_VERSION`、`NanoFlowSettingsStore`、`ToolkitRegistryOptions`…）。

治理：把公共面收敛到 `index.ts` 一处显式导出（插件身份、`Config`、`TOOL_IDS`、entry）；内部模块默认不 `export` 类型；测试钩子集中在 `*.test-support.ts`。目标导出数约 150。

### F2 重复实现：同一逻辑散落多处

| 逻辑 | 现状 | 证据 |
| --- | --- | --- |
| `describe(error)` | **13 处**各自实现 | `index.ts`、`plugin.ts`、`rotate.ts`、`host/*` 4 处、`client/*` 2 处、`tools/shared.ts`、`check-domain.mjs` |
| `isRecord` / `asRecord` | **5 处** | `host/nano-flow-settings.ts`、`host/toolkit-routes.ts`、`nano-flow/plan-log-service.ts`、`nano-flow/tools/shared.ts`、`nano-flow/plan-log.ts` |
| YAML frontmatter 解析 | **3 套** | `nano-flow/notes.ts`（yaml 库）、`nano-flow/scripts/check-domain.mjs`（手写）、`nested-skill/parse.ts`（手写） |
| Plan 扫描 | **2 套** | `nano-flow/plan.ts`（运行时 listPlans）、`check-domain.mjs`（scanPlans） |
| 绑定表读取 | **2 套** | `plan-log.ts` 的 `readBindings`（异步）与 `readBindingsSync`（同步） |
| 工作区解析 | **3 处** | `plugin.ts` 的 `workspaceOf`、`tools/shared.ts` 的 `workspace()`、`index.ts` `notesOf` 里读 session cwd |
| `hasMethod` | **2 处** | `host/services.ts`、`client/contract.ts`（双端无法直接共享） |

治理：抽 `src/shared/`（双端纯函数：errors、record、frontmatter）与 `src/nano-flow/` 内部的单一解析层；客户端与宿主各自保留最小适配。`check-domain.mjs` 与运行时共享的解析逻辑，改成"脚本调用共享 JS 产物"或把脚本并入 TS 构建。

### F3 单点大文件与分层缺失

- `src/nano-flow/scripts/check-domain.mjs` **1248 行**，是全部文档的唯一守门人，却无类型、独立进程运行、直接读文件系统；
- `src/index.ts` **586 行**：插件装配、路由注册、轮转钩子、运行期服务、笔记快照都在一个文件；
- 分层没有机械约束：`client/` 目前通过 `../contract.js` 反向依赖主入口的类型；`nano-flow/*` 与 `host/*` 互相穿插（`hostServices` 包装 `serviceOf`，但两处都在 `host/`）。

治理：拆 `check-domain.mjs` 为 `shared/frontmatter` + `nano-flow/validate/*` + 索引渲染；拆 `index.ts` 为装配 / 路由 / 运行期；用一条测试或 lint 规则固定"shared 不依赖 host/client、nano-flow 不依赖 client"。

### F4 质量门禁（沿用前一版评估）

覆盖率分支 79.04% 低于 80% 门槛（基线 78.74% 也失败）；`index.test.ts` 657 行；`primitives.d.ts` 只声明宿主契约的一小部分。

## 建议的重构顺序

1. **F1 死代码**：先删干净，减少后面三阶段要搬的体积（低风险，可独立验收）。
2. **F2 去重**：`describe` / `isRecord` / frontmatter / 绑定读取 / 工作区解析逐个收敛，每项一批，行为由现有 337 项测试兜住。
3. **F3 拆文件与分层**：先拆 `check-domain.mjs`（有 479 行测试），再拆 `index.ts`，最后加分层断言。
4. **F4 门禁**：覆盖率补到 80% 或按模块豁免并记录；补硬规则关键字断言。

## 风险

- `check-domain.mjs` 是唯一守门人，重构必须逐段搬、每段跑全量 `nano_flow_check` 对比输出；
- 删除导出要区分"真死"与"测试钩子/对外 API"；`index.ts` 的公共面在删除前先确认宿主侧没有按名取值；
- 覆盖率没修好之前，重构后无法用覆盖率证明"没删逻辑"，只能靠测试与文档校验。

## 相关

- [005-收敛绑定表生命周期与遗留缺陷](005-收敛绑定表生命周期与遗留缺陷.md) — F4 覆盖率缺口的来源。
