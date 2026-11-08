---
name: '001-状态机定案：pending直进waiting与blocked并入waiting'
description: '定案并落地：状态 5→4、needs 增 blocked，pending 可直进 waiting，依赖规则放宽；代码/文案/测试/0.4.6 构建完成，等验收。'
status: blocked
reason: '等待用户验收：旧 waiting/needs=review'
related_noted: []
next_step: '1. 用户验收通过后 `complete`。 2. 装包重启（0.4.6）后做上面第 4 项原生验证；未装包前本会话仍跑 0.4.5 的旧规则。 3. 后续独立议题：`pi-toolkit` orchestrator 与 `packages/nano-flow` 旧脚本的状态机分叉（本轮明确不动）。'
---

# 001-状态机定案：pending直进waiting与blocked并入waiting

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 定案（第 1 轮收敛）

状态收敛为 4 个：`pending` / `in_progress` / `waiting` / `completed`。
`needs` 扩为 3 个取值：`answer`（等人回答）/ `review`（等人验收）/ `blocked`（等阻塞解除）。

| 目标状态 | 强制条件 |
|---|---|
| `pending` | 无 |
| `in_progress` | 直接依赖必须 `completed` |
| `waiting` | 必须给 `needs`；**不再要求先 `in_progress`**；`needs=blocked` 时必须给 `blocked_reason` |
| `completed` | 只能 `complete`，且必须 `waiting + needs=review` + evidence + Plan 校验通过 |

- 转移：`create → pending`；`pending → in_progress | waiting`；`in_progress → pending | waiting`；`waiting → in_progress | pending`（可原地换 `needs`）。`completed` 只经 `complete` 进入。
- `blocked_reason` 保留原名；`needs` 不是 `blocked` 时自动清空。
- 依赖规则放宽：只有 `in_progress` 与 `completed` 要求直接依赖已完成，`pending` 与 `waiting` 不受限。
- 写入端传 `status: blocked` 报错并引导 `status=waiting` + `needs=blocked`。
- 旧 `blocked` 文档**不做兼容**（用户两次确认）：含 `status: blocked` 的旧 `notes.json` 会校验失败，而 `repair` 改不了 status、`notes-guard` 又禁止用文件工具直接改，只能绕过守卫手改或弃用该 Plan。工作区当前 0 条 `blocked`。
- 范围只改 `packages/dsh-toolkit`：`pi-toolkit` 的 orchestrator 与 `packages/nano-flow` 的旧脚本保持原样，分叉显式保留。

## 拷问记录（第 1 轮，已收敛）

| Q | 决策 | 理由摘要 |
|---|---|---|
| Q1 `needs` 新取值 | `blocked` | 与旧状态名一一对应，词汇复用，改动最小 |
| Q2 原因字段 | 保留 `blocked_reason`，`needs=blocked` 时必填 | 改名要同时迁移旧文档、契约与面板 |
| Q3 依赖校验 | 放宽：只有 `in_progress` / `completed` 受限 | 否则「还没开工先挂着等人」无法表达 |
| Q4 旧 blocked 文档 | 不兼容、不折算、不扩展 `repair` | 用户先答「不需要兼容」，追问死局后答「旧文档坏了就算了」 |
| Q5 改动范围 | 只改 `packages/dsh-toolkit` | 本轮只交付本会话预设；pi 侧与 CLI 分叉显式保留 |

补充：`waiting ↔ in_progress` 现状本就可双向，本轮真正新增的是 `pending → waiting` 直连与 `blocked` 合并。

## 实施结果

- 状态与校验：`dag.ts`（4 状态、3 个 needs、依赖规则、`blocked_reason` 条件、排序两档）、`scripts/check-domain.mjs`（同步，并补 `needs` 进归一化记录）。
- 工具：`tools/write.ts`（`status=blocked` 引导、`pending→waiting` 直连、`needs=blocked` 必须给 `reason`）、`tools/shared.ts`（`statusLine` 去掉 blocked、`formatNoteLine` 用 `[waiting/blocked]`）、`tools/read.ts`（`resume` 分「等待回答／等待确认／待阻塞解除」）。
- 契约与界面：`contract.ts`（状态 4 值、needs 3 值、`NanoFlowReadyCounts.needsBlocked`）、`host/nano-flow-ready.ts`、`client/host-api.ts`、`client/ready-panel.ts`（`needs=blocked` 走阻塞 glyph，摘要「N 阻塞」）。
- 文案：`prompt.md`、`README.md`、`skills/do/SKILL.md`。
- 测试：`dag.test.ts`、`runtime.test.ts`、`host/nano-flow-ready.test.ts`、`client/ready-panel.test.ts`。
- 版本：0.4.5 → 0.4.6；`pnpm run build` 重新生成 `dist/nano-flow`（含新 `check-domain.mjs`）。
- 领域知识：`dsh/CONTEXT.md` 术语「等待确认」改为「等待」（三取值）；新增 `adr/0006-note等待态以needs合并阻塞.md`。

## 执行检查点

实现、文案、测试、构建与领域知识已全部完成；`vp check`、254 项测试、`pnpm run build`、新旧两版 `check-domain.mjs` 全区覆盖均通过。当前状态：等用户验收。

## 待验证

1. 代码口径：`packages/dsh-toolkit/src/nano-flow/dag.ts`、`tools/write.ts` 的新分支（`dv` 与 `pnpm test` 已覆盖）。
2. 校验脚本：`node packages/dsh-toolkit/src/nano-flow/scripts/check-domain.mjs . --domains .agents/domains --limits <默认上限>` → `校验通过。`
3. 夹具回归：`.temp/nf-check-fixture.mjs` → waiting 依赖未完成「通过」、in_progress 依赖未完成「失败」、`needs=blocked` 缺原因「失败」、旧 `status=blocked`「失败」。
4. 装包重启后（0.4.6）在本会话实跑：`create → status=waiting needs=answer`（不经 in_progress）应成功；`status=blocked` 应被拒并提示 `needs=blocked`。

## 下一步

1. 用户验收通过后 `complete`。
2. 装包重启（0.4.6）后做上面第 4 项原生验证；未装包前本会话仍跑 0.4.5 的旧规则。
3. 后续独立议题：`pi-toolkit` orchestrator 与 `packages/nano-flow` 旧脚本的状态机分叉（本轮明确不动）。

