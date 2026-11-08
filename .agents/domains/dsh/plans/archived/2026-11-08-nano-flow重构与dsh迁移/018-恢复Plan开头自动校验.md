---
name: "018-恢复Plan开头自动校验"
description: "恢复 Plan 时开头自动跑一次 nano_flow_check：校验 Plan 并建立会话↔Plan 看板绑定（同 017 的轮转自动校验），约束写进 prompts/system.md。"
status: completed
related_noted:
  - '015-Plan绑定贯通Note面板'
  - '017-轮转后自动校验Plan并绑定看板'
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

## live 验收（2026-11-08，用户确认）

用户重启宿主（desktop 进程 18:49:16 载入 0.5.29）后按上述步骤验证新会话恢复 Plan：模型开头先调 `nano_flow_check`、Note 看板出现，用户确认「已经验证」。工作区当前只有本 Plan 一个 active Plan，check 能按「恰好一个」自动建绑定（`tools/check.ts:33-40`）。

Plan 按用户要求保持 `active`，不迁 `reference`。
