---
name: 'note状态机合并waiting与blocked'
description: '状态 4 个：`pending` / `in_progress` / `waiting` / `completed`。 `waiting` 必带 `needs`，取值 3 个：`answer`（等人回答）/ `review`（等人验收）/ `blocked`（等阻塞解除）。'
status: in_progress
---

# note状态机合并waiting与blocked

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 旧 story

我是 nano-flow 预设的使用者与维护者。当前 note 有 5 个状态（`pending` / `in_progress` / `waiting` / `blocked` / `completed`），但 `waiting` 和 `blocked` 表达的是同一件事的两面：都不在推进、都在等自身之外的东西。分成两个状态让工具、校验脚本、恢复包、面板与提示词各自维护两套分支，且 `waiting` 还被限制为「只能从 `in_progress` 进入」——一条刚建好、还在等用户答复的 note 必须先假装开工一次才能如实标记。

我希望：

1. `pending` 可以直接进入 `waiting`，也可以进入 `in_progress`；
2. `waiting` 与 `in_progress` 可以互相转换；
3. `blocked` 不再是一个独立状态，并入 `waiting`，在 `needs` 里增加一个取值表示「被堵住、正在等」；
4. 状态机因此从 5 个状态收敛到 4 个，语义只剩「没开始 / 在推进 / 在等（等回答、等验收、等阻塞解除）/ 已完成」。

验收标准：新状态机在 `nano_flow_write`、`nano_flow_read`、`nano_flow_check`、面板与提示词里表现一致；旧文档不会因这次改动变成坏文档；现有 35 个 Plan 的 `notes.json` 全部仍能通过校验。


## 旧 spec

## 目标形态（已定案，见 note 01）

状态 4 个：`pending` / `in_progress` / `waiting` / `completed`。
`waiting` 必带 `needs`，取值 3 个：`answer`（等人回答）/ `review`（等人验收）/ `blocked`（等阻塞解除）。

```
create ──► pending ⇄ in_progress ⇄ waiting ──► completed(仅 complete 且 needs=review)
             │                                    ▲
             └──────────► waiting ────────────────┘（needs=review 时才可 complete）
```

| 目标 | 强制条件 |
|---|---|
| `pending` | 无 |
| `in_progress` | 直接依赖必须 `completed` |
| `waiting` | 必须给 `needs`；不要求先 `in_progress`；`needs=blocked` 时必须给 `blocked_reason` |
| `completed` | 只能 `complete`；必须 `waiting + needs=review` + evidence + Plan 校验通过 |

- 依赖规则放宽：只有 `in_progress` 与 `completed` 要求直接依赖已完成；`pending` / `waiting` 不受限。
- `blocked_reason` 保留原名；`needs` 不是 `blocked` 时清空。
- 写入端 `status: blocked` 报错并引导 `status=waiting` + `needs=blocked`。
- 展示：`resume` 分「等待回答 / 等待确认 / 待阻塞解除」；ready 面板计数 `waiting` + `needsBlocked`；组内排序两档（可执行 / 等待）。

## 影响面（只改 packages/dsh-toolkit）

- 状态与校验：`src/nano-flow/dag.ts`、`src/nano-flow/scripts/check-domain.mjs`
- 工具：`tools/write.ts`、`tools/shared.ts`、`tools/read.ts`
- 契约与界面：`src/contract.ts`、`src/host/nano-flow-ready.ts`、`src/client/host-api.ts`、`src/client/ready-panel.ts`
- 文案：`src/nano-flow/prompt.md`、`README.md`、`src/nano-flow/skills/do/SKILL.md`
- 测试：`dag.test.ts`、`runtime.test.ts`、`tools/tools.test.ts`、`host/*.test.ts`、`client/*.test.ts`
- 交付：`packages/dsh-toolkit/package.json` 升版本，装包重启验证
- 领域知识：`dsh/CONTEXT.md` 术语改写 + 新增 ADR 0006

范围外（明确不动）：`pi-toolkit/src/orchestrator/**`、`packages/nano-flow` 的旧 skill 脚本。

## 兼容

- 旧 `blocked` 文档不兼容：读入即校验失败；`repair` 不改 status、`notes-guard` 禁手改，故只能绕过守卫手改或弃用（用户已确认接受）。
- `awaiting_verification` 折算规则保持不变。
- 工作区存量：`blocked` 0 条、`waiting` 1 条。

## 验收基线

1. 4 个状态、3 个 needs 在 write/read/check/ready 与面板口径一致；
2. 全部 Plan 通过 `nano_flow_check` 的 `workspace`；
3. `pending → waiting`、`waiting ↔ in_progress`、`needs=blocked` 必填 `blocked_reason` 有测试覆盖；
4. `pnpm test`、类型检查与构建通过；装包重启后本会话可原生验证。

## 当前进度

已实施完成并自验通过：4 状态 / 3 个 needs、`pending → waiting` 直连、依赖规则放宽、`blocked_reason` 条件必填、工具与面板文案、254 项测试、`vp check`、`pnpm run build`、新旧两版 `check-domain.mjs` 全区覆盖；版本升到 0.4.6，`dsh/CONTEXT.md` 术语与 ADR 0006 落地。当前 note 01 处于 `waiting + needs=review`，等用户验收。

## 恢复入口

1. `nano_flow_read` 的 `resume` → 读 note 01「实施结果」「执行检查点」「下一步」；
2. 用户验收后再 `complete`（evidence 见 note 01 下条），然后装包重启做原生验证；
3. 未闭环项：`pi-toolkit` 与 `packages/nano-flow` 的分叉（本轮明确不动）。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [001-状态机定案：pending直进waiting与blocked并入waiting](001-%E7%8A%B6%E6%80%81%E6%9C%BA%E5%AE%9A%E6%A1%88%EF%BC%9Apending%E7%9B%B4%E8%BF%9Bwaiting%E4%B8%8Eblocked%E5%B9%B6%E5%85%A5waiting.md) | 定案并落地：状态 5→4、needs 增 blocked，pending 可直进 waiting，依赖规则放宽；代码/文案/测试/0.4.6 构建完成，等验收。 | blocked | 等待用户验收：旧 waiting/needs=review | 1. 用户验收通过后 `complete`。 2. 装包重启（0.4.6）后做上面第 4 项原生验证；未装包前本会话仍跑 0.4.5 的旧规则。 3. 后续独立议题：`pi-toolkit` orchestrator 与 `packages/nano-flow` 旧脚本的状态机分叉（本轮明确不动）。 | — |
