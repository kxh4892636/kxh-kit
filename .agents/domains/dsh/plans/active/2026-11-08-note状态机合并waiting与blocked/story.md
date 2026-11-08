# note 状态机合并 waiting 与 blocked

我是 nano-flow 预设的使用者与维护者。当前 note 有 5 个状态（`pending` / `in_progress` / `waiting` / `blocked` / `completed`），但 `waiting` 和 `blocked` 表达的是同一件事的两面：都不在推进、都在等自身之外的东西。分成两个状态让工具、校验脚本、恢复包、面板与提示词各自维护两套分支，且 `waiting` 还被限制为「只能从 `in_progress` 进入」——一条刚建好、还在等用户答复的 note 必须先假装开工一次才能如实标记。

我希望：

1. `pending` 可以直接进入 `waiting`，也可以进入 `in_progress`；
2. `waiting` 与 `in_progress` 可以互相转换；
3. `blocked` 不再是一个独立状态，并入 `waiting`，在 `needs` 里增加一个取值表示「被堵住、正在等」；
4. 状态机因此从 5 个状态收敛到 4 个，语义只剩「没开始 / 在推进 / 在等（等回答、等验收、等阻塞解除）/ 已完成」。

验收标准：新状态机在 `nano_flow_write`、`nano_flow_read`、`nano_flow_check`、面板与提示词里表现一致；旧文档不会因这次改动变成坏文档；现有 35 个 Plan 的 `notes.json` 全部仍能通过校验。
