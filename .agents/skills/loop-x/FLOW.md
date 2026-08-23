# Flow 调用协议

本文件是 `/loop-x`、`/grill-with-docs`、`/to-story` 和 `/to-issues` 调用 `flow.mjs` 的单一事实源。四个 skill 在触发 Flow 前完整读取本文件；`flow.mjs` 的实际返回值是运行态事实源。

所有命令都从工作区根目录执行。下文使用 `.agents/skills/loop-x` 表示当前 `/loop-x` skill 目录；skill 安装在其他位置时替换为实际目录。脚本只依赖 Node.js 标准库。

## 触发与进入

一次路径进入只由发起者执行一次 `enter-plan`：

| 发起者                      | 选择入口                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/loop-x`                   | 根据用户输入推荐 `/grill-with-docs`、`/to-story` 或 `/to-issues`，说明理由并等待用户明确确认；确认后以自身为发起者、推荐结果为入口执行 `enter-plan` |
| 直接调用 `/grill-with-docs` | 固定进入 `main` 路径，自动执行 `enter-plan`                                                                                                         |
| 直接调用 `/to-story`        | 固定进入 `story` 路径，自动执行 `enter-plan`                                                                                                        |
| 直接调用 `/to-issues`       | 固定进入 `issues` 路径，自动执行 `enter-plan`                                                                                                       |

```powershell
node .agents/skills/loop-x/script/flow.mjs enter-plan --skill /loop-x --entry /<entry-skill> --plan <plan-path> --session <session-id>
node .agents/skills/loop-x/script/flow.mjs enter-plan --skill /<entry-skill> --plan <plan-path> --session <session-id>
```

- `/loop-x` 只能通过 `--entry` 选择 `/grill-with-docs`、`/to-story` 或 `/to-issues`；脚本在同一事务中由入口推导并进入 `main`、`story` 或 `issues` 路径。直接调用固定入口时不得指定 `--entry`。
- `/grill-with-docs` 可省略 `--plan`，运行键默认为 `.`；`/to-story` 和 `/to-issues` 使用实际 Plan 路径。
- 首次进入可省略 `--session`，脚本生成会话 ID。保留返回的 `plan` 和 `session`，后续步骤全部复用。
- 已有运行态时，`enter-plan` 只允许接入当前期待的入口 skill。
- `/loop-x` 完成 `enter-plan` 后，将返回的 flow context 传给入口 skill；入口 skill 直接继续，不重复进入。固定入口从上一步接收到 flow context 时同样直接继续。
- `enter-plan` 返回的 `next_skill` 是所选入口。发起者是 `/loop-x` 时调用它；发起者就是该入口 skill 时，返回值授权继续当前执行。

## Receipt 链

命令成功返回的 `next_skill` 或 `next_action` 是唯一允许执行的下一步。完成当前步骤后登记结果与至少一项实际证据，登记成功后才执行新返回值：

```powershell
node .agents/skills/loop-x/script/flow.mjs record-plan --plan <plan-path> --session <session-id> --skill /<skill> --result <result> --evidence <path-or-result>
node .agents/skills/loop-x/script/flow.mjs record-plan --plan <plan-path> --session <session-id> --action commit --result committed --evidence <commit-id>
node .agents/skills/loop-x/script/flow.mjs claim-issue --plan <plan-path> --issue <NN> --session <session-id>
node .agents/skills/loop-x/script/flow.mjs record-issue --plan <plan-path> --issue <NN> --session <session-id> --skill /<skill> --result <result> --evidence <path-or-result>
node .agents/skills/loop-x/script/flow.mjs record-issue --plan <plan-path> --issue <NN> --session <session-id> --action commit --result committed --evidence <commit-id>
```

Plan 路径的 receipt 链：

| 路径     | 顺序                                                               | 终点        |
| -------- | ------------------------------------------------------------------ | ----------- |
| `main`   | `/grill-with-docs=completed` → `/dev-gate=ready` → 完整交付链      | `completed` |
| `story`  | `/to-story=completed` → `/to-issues=completed` → `/dev-gate=ready` | `ready`     |
| `issues` | `/to-issues=completed` → `/dev-gate=ready`                         | `ready`     |

入口 skill 使用对应产物作为完成证据：`/grill-with-docs` 使用实际维护的领域文档，`/to-story` 使用 `story.md`，`/to-issues` 使用 `spec.md`。`record-plan` 拒绝缺项、乱序和错误结果。

`main` 路径和每个已领取 issue 的完整交付链为：

```text
/implement=started
  -> /tdd=completed|skipped
  -> /verifying=passed
  -> /code-review=reviewed
  -> commit=committed
```

- `/tdd` 即使不适用也必须执行，由它给出 `skipped`；登记时提供 `--reason`。
- `commit` 是 `next_action`，不是 skill。Issue 提交前，其「交付记录」必须包含交付物与验证证据。
- `story` 和 `issues` 路径到达 `ready` 后，使用 `claim-issue` 领取依赖已满足的 issue；首次领取可省略 `--session` 并由脚本生成，成功后保留返回的 `issue`、`plan` 和 `session`。脚本同步状态并返回 `/implement`。

## 租约与恢复

- 较长操作前使用 `heartbeat-plan` 或 `heartbeat-issue` 续租；主动暂停使用 `release-plan` 或 `release-issue`。
- Plan 租约过期后使用 `claim-plan` 接管；Issue 租约过期后使用 `resume-issue` 接管。
- 真实障碍使用 `block-issue --reason <原因> --release-condition <解除条件>`，记录阻塞并释放租约。
- 异常退出或移动 Plan 后使用 `sync-plan --plan <plan-path>`，从 issue frontmatter 重建 spec 派生视图。

并发边界只到 issue：同一 Plan 中直接依赖均已 `completed` 的不同 issue 可以由不同会话领取；同一 issue 同时只有一个有效租约。协议不锁定 `CONTEXT-MAP.md`、`CONTEXT.md`、ADR 或其他全局领域文件。

## 状态与持久化

`.loop/state.json` 保存租约、skill 游标与 receipt；`.loop/state.lock` 只在单次运行态及 Plan 视图更新事务内短暂持有。二者不是领域文档，不参与版本控制。issue frontmatter 的 `status:` 是持久化执行状态的来源，spec 的状态与 Issue 表是派生视图，`flow.mjs` 在同一事务中协调三者。

```text
pending ──领取──> in_progress ──交付物与验证证据齐备──> completed
                         │
                         └─真实障碍──> blocked ──障碍解除并恢复──> in_progress
```

- `pending` 只因实际领取进入 `in_progress`；依赖完成只改变可执行性。
- `blocked` 带有障碍与解除条件。
- `completed` 带有交付物与验证证据，且内容冻结；后续修正创建新 issue 并交叉链接。
- spec 聚合状态是全函数：全部 issue 为 `pending` 时是 `pending`，全部为 `completed` 时是 `completed`，其余组合都是 `in_progress`。
- Plan 的 `active → reference | archived` 生命周期与执行状态正交。

`flow.mjs` 是流程门禁，不是安全沙箱：它能原子拒绝乱序、漏记、重复领取和未满足依赖的领取，证据真实性仍由执行者负责。只在步骤实际完成后登记 receipt。
