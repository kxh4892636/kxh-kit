# Flow 运行协议

本文件定义 `/nano-flow` 如何驱动 `flow.mjs`；主流程中的其他 skill 不触发该脚本。脚本返回的 JSON 是当前步骤、租约与状态的运行态事实源。脚本命令及 options 以现场帮助为准：

```powershell
node <nano-flow-skill-root-dir>/scripts/flow.mjs --help
```

所有命令从工作区根目录执行。首次使用一个命令前查看其帮助；保留成功结果中的 `plan`、`session`、`issue`、`next_skill`、`next_action` 与 `message`，后续调用原样复用对应标识和消息。

## 进入与恢复

- 主流程：`/questing -> /to-issues -> /code-delivery`。
- Flow 只执行一次 `enter-plan`，由 `/nano-flow` 以 `--entry /questing` 进入已确认的 Flow。
- `--mode` 可选 `manual`（默认）或 `auto`，用于匹配 hook。模式随 Plan 持久化，重新进入时传入即切换。
- `--plan` 是本轮稳定标识。需要进入 `/to-issues` 时，它必须是工作区内的实际 Plan 路径；跳过 `/to-issues` 时只要求它在工作区内唯一且稳定。
- 已有运行态使用 `status` 查明当前位置，再按返回值恢复。
- 命令成功且当前调用者持有唯一有效租约、返回的 `next_skill` 与预期入口一致时，进入完成。

## Hooks 与确认

确认与推进提示词由 [extensions/hooks.json](extensions/hooks.json) 管理，脚本只校验、匹配和返回：`match` 为 `all` 或主流程 skill 名称数组；可选 `mode` 为 `all | manual | auto`（缺省 `all`）；`message` 为非空单行提示词。

同时匹配 `next_skill` 与当前 Plan 模式的 hook 按配置顺序拼接；只在有匹配消息时返回 `message`。携带 Flow context 时，当前 skill 及其内部调用的确认方式按返回的 hook 消息执行；产物与证据仍须满足实际完成条件。

## Receipt chain

`next_skill` 或 `next_action` 是唯一获准的下一步：

1. 完整读取并执行返回的 skill；action 则等待其前置 skill 交付控制权。
2. 只在该 skill 的完成标准真实成立后，使用 `record-plan` 或 `record-issue` 登记结果和至少一项可核查证据。
3. 登记成功后丢弃旧的 next 值，只执行新返回值。

`/questing` 完成后进入 `/to-issues`，由它判断任务是否需要可恢复的 issue graph，再由 `/nano-flow` 登记其 `completed` 或 `skipped` 结果。

`delivering_direct` 返回 Plan 级 `/code-delivery`；`delivering_issues` 由 `claim-issue` 返回 Issue 级 `/code-delivery`。

`/code-delivery` 完成准入、执行基线为 `ready` 后登记 `started`，并保留返回的 `commit` action；准入、代码、`/code-test`、`/verifying` 与 `/code-review` 均在它内部完成，不另记 Flow receipt。全部门禁仍适用于当前 diff 后，才执行并登记 `commit=committed`。

每条 receipt 引用本轮真实产物或结果，证据存在、对应当前目标与 diff 且足以复核声明时完成。

## Issue 推进

本节由 `/nano-flow` 执行；`/to-issues` 只负责建立或维护 spec 与 issue 图。

- 仅当 `/to-issues=completed` 且 Plan 到达 `delivering_issues` 后，从 spec 派生表定位 `pending` 且直接依赖均已 `completed` 的 frontier，并以运行态核对；有多个候选时使用用户已确认的优先级。以 `claim-issue` 领取一个 issue，首次领取保留脚本生成的 issue session。
- 一个 session 串行推进自己领取的 issue，交付或形成真实 blocked 结果后才领取下一个。不同 session 可以并行领取互不阻塞的 issue；同一 issue 只有一个有效租约。
- 新事实或新工作按 `/to-issues` 的文档维护规则更新 Plan；符合 ADR 资格的长期 trade-off 由 `/questing`写入领域文档。
- 交付前，issue 的「交付记录」包含交付物与验证证据；脚本据此允许完成状态与 commit receipt。
- 每次暂停前同步 issue 状态、spec 派生视图与证据；恢复时只信任文件与运行态。
- 所有 issue 完成后，Plan 自动进入 `completed`；再以 `sync-plan` 刷新派生视图，与用户确认参考价值，按 [`DOMAIN.md`](references/DOMAIN.md) 把整个 Plan 移入 `reference/` 或 `archived/`，并重新运行领域校验。

一个领取结果有且只有一个终态、状态与 spec 派生视图一致、证据链可复核时，本轮推进完成。

## 租约、阻塞与恢复

- 较长操作用 `heartbeat-plan` 或 `heartbeat-issue` 续租；主动暂停用 `release-plan` 或 `release-issue`。
- 租约过期后用 `claim-plan` 或 `resume-issue` 接管。
- 真实障碍用 `block-issue` 记录原因和可判定的解除条件，并释放租约。
- 异常退出或移动 Plan 后用 `sync-plan` 从 issue frontmatter 重建 spec 派生视图。

写命令失败时保留现场，依据错误信息恢复前置条件。

## 持久状态

`.flow/state/YYYY-MM-DD-state.json` 按本地日期保存当日阶段、租约、游标与 receipt。不读取无日期前缀或其他日期的状态文件。

Plan 的 `phase` 是显式执行阶段：

```text
planning
  ├─ /to-issues=skipped
  │      ↓
  │  delivering_direct ── commit=committed ─→ completed
  │
  └─ /to-issues=completed
         ↓
     delivering_issues ── all issues completed ─→ completed
```

`cursor` 只表示当前阶段内的位置，切换阶段时归零；`lease` 与阶段正交。Plan 运行态直接保存为 `{ phase, cursor, lease, receipts, issues }`。

issue frontmatter 的 `status` 是持久化 Issue 执行状态的事实源，spec 状态与 Issue 表是派生视图：

```text
pending -> in_progress -> completed
              |
              +-> blocked -> in_progress
```

`blocked` 必须带障碍与解除条件；`completed` 必须带交付物与验证证据，后续修正以新 issue 表达。Plan 的 `active -> reference | archived` 生命周期与执行状态正交。

`flow.mjs` 约束顺序与状态，不证明证据真实性。只有可复核证据与登记结果一致时，Flow 步骤才算完成。
