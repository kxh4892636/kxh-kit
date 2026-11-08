---
name: "018-恢复Plan开头自动校验"
description: "恢复 Plan 时开头自动跑一次 nano_flow_check：校验 Plan 并建立会话↔Plan 看板绑定（同 017 的轮转自动校验），约束写进 prompts/system.md。"
status: blocked
reason: "0.5.29 已构建并装入 desktop/web profile；等重启宿主后开新会话（非轮转）恢复 Plan 做 live 验收：模型开头先跑 nano_flow_check、看板出现"
related_noted:
  - '015-Plan绑定贯通Note面板'
  - '017-轮转后自动校验Plan并绑定看板'
next_step: "重启宿主 → 新会话说「恢复 Plan dsh/active/2026-11-08-nano-flow重构与dsh迁移」→ 核对模型是否开头跑 check 且看板出现"
---

# 018-恢复Plan开头自动校验

## 需求（用户）

恢复 Plan 时，**开头自动执行一次 `nano_flow_check`**；目的同 017：①校验 Plan（YAML/篇幅/状态派生/索引）；②建立本会话↔Plan 绑定，让 Note 看板出现。

## 现状

- `prompts/system.md` 的恢复条款只要求只读恢复，没有要求跑校验；只有轮转新会话由宿主 `autoCheck` 跑过并写绑定（017）。
- `nano_flow_check` 工具本身会在「恰好一个 active Plan」或显式指定 `plan` 时经宿主 facade 写绑定（`tools/check.ts:33-40`，015），所以跑一次工具就同时完成校验与建绑定。
- 用户在新会话里说「恢复 Plan」时没有这条约束，模型不跑 check，看板无绑定（除非该会话是轮转出来的）。

## 设计

在 `prompts/system.md`「恢复与轮转」第一条恢复条款里加约束：恢复已有 Plan 时开头先跑一次 `nano_flow_check`——只刷新生成的索引与追踪表、不改 Plan 内容；随后再进入只读恢复。轮转新会话的 seed 已带校验结论时跳过，避免重复。

## 验收

- 单测：注入的固定提示词含该约束（「开头先跑一次 `nano_flow_check`」+ 跳过条件）。
- `vp check` / `vp test src/nano-flow` / `vp run build` 通过；0.5.29 装入 desktop 与 web profile，安装副本的 `dist/nano-flow/prompts/system.md` 含该条款。
- live：新会话（非轮转）说「恢复 Plan」时，模型开头先跑 `nano_flow_check`，Note 看板出现。

## 实现（0.5.29）

- `prompts/system.md` 恢复条款：恢复已有 Plan 时**开头先跑一次 `nano_flow_check`**（校验 + 经宿主 facade 建绑定；只重写生成的索引与追踪表，是本轮唯一写操作），轮转新会话 seed 已带结论时跳过。
- `plugin.test.ts` 新增用例：注入的固定提示词含「开头先跑一次 `nano_flow_check`」与跳过条件。
- 版本 0.5.29：`vp check`（123 文件格式、94 文件 lint/类型）通过；`vp test src/nano-flow` 13 文件 / **97 例**通过；`vp run build` 成功（`dist/nano-flow/prompts/system.md` 含条款）；`pnpm pack` 后 `pnpm add` 进 desktop 与 web profile，两份安装副本均为 0.5.29 且 `dist` 条款命中。

## 待 live 验收

重启宿主（当前进程仍载 0.5.28）后开新会话（非轮转），说「恢复 Plan dsh/active/2026-11-08-nano-flow重构与dsh迁移」：

1. 模型第一步调 `nano_flow_check`，而不是先读 spec；
2. `nano-flow-plan-bindings.json` 出现该会话，Note 看板出现；
3. 之后才进入只读恢复报告。
