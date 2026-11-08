# note 等待态以 needs 合并阻塞

note 曾有 `waiting` 与 `blocked` 两个状态，但二者表达同一件事的两面：都不在推进、都在等自身之外的东西，于是工具、校验脚本、恢复包、面板与提示词各自维护两套分支；`waiting` 还被限制为只能从 `in_progress` 进入，一条刚建好、还在等答复的 note 必须假装开工一次。改为四态 `pending` / `in_progress` / `waiting` / `completed`，等待目标收敛为 `waiting.needs`：`answer`（等人回答）、`review`（等人验收）、`blocked`（等阻塞解除）；阻塞原因仍用 `blocked_reason`，仅在 `needs=blocked` 时必填。

## Considered Options

- **needs 合并（选定）**：状态 4 个、等待目标 3 个；「在推进」与「在等」分层清楚，`pending → waiting` 直连可用，每个消费点少一支状态分支。
- **保留 `blocked` 独立状态**：改动最小，但两状态在每个消费点继续重复，且无法表达「还没开工就在等」。
- **`blocked_reason` 改名 `reason`**：词汇更中性，代价是同时迁移旧文档字段、契约类型与面板读取。

## Consequences

- 旧文档里 `status: blocked` 不再合法；`repair` 改不了 status、`notes-guard` 禁手改 `notes.json`，所以这类文档只能绕过守卫手改或弃用（用户明确接受）。
- `pending` 与 `waiting` 不再要求直接依赖已完成，只有 `in_progress` 与 `completed` 受限。
- 同一状态机在 `packages/pi-toolkit/src/orchestrator` 与 `packages/nano-flow` 的旧 skill 脚本里仍有副本，本次未同步，分叉显式存在。
