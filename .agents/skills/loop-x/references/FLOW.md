# Flow 运行协议

本文件定义 skills 如何驱动 `flow.mjs`；脚本返回的 JSON 是当前步骤、租约与状态的运行态事实源。脚本命令及 options 以现场帮助为准：

```powershell
node <loop-x-skill-dir>/script/flow.mjs --help
```

所有命令从工作区根目录执行。首次使用一个命令前查看其帮助；保留成功结果中的 `plan`、`session`、`route`、`issue`、`next_skill` 与 `next_action`，后续调用原样复用对应标识。

## 进入与恢复

- 新路径只执行一次 `enter-plan`。`/loop-x` 以 `--entry` 传入用户确认的 `/grill-with-docs`、`/to-story` 或 `/to-issues`；直接调用这三个入口时以自身进入固定路径，不代理选择其他入口。
- `/grill-with-docs` 使用 `YYYY-MM-DD-{name}` Flow 标识；`/to-story` 与 `/to-issues` 使用工作区内的实际 Plan 路径。
- 接收到 flow context 的 skill 直接复用，不再次进入。已有运行态使用 `status` 查明当前位置，再按返回值恢复。
- 命令成功且当前调用者持有唯一有效租约、返回的 `next_skill` 与预期入口一致时，进入完成。

## Receipt chain

`next_skill` 或 `next_action` 是唯一获准的下一步：

1. 完整读取并执行返回的 skill；action 则等待其前置 skill 交付控制权。
2. 只在该 skill 的完成标准真实成立后，使用 `record-plan` 或 `record-issue` 登记结果和至少一项可核查证据。
3. 登记成功后丢弃旧的 next 值，只执行新返回值。

Plan setup 中的 `/to-story` 与 `/to-issues` 带 required child。父 skill 先登记 `started`，只调用脚本返回的 child；child 登记 `completed` 后，只恢复脚本返回的父 skill；父 skill 达到自身完成标准后再登记 `completed`。运行态负责给出 child 与恢复顺序，不手工推演路径。

`/to-issues` 是 `/grill-with-docs` 的长任务持久化层：父 skill 用 Plan 保存设计 frontier 与交付状态，required child 只完成当前设计循环并维护共享领域文档，不另建 Plan 或复制父状态。

`/implement` 是交付链的父步骤：进入后先登记 `started` 并保留返回的 `commit` action；代码、`/code-test`、`/verifying` 与 `/code-review` 是它返回前的内部门禁，不另记 Flow receipt。全部门禁仍适用于当前 diff 后，才执行并登记 `commit=committed`。

每条 receipt 都引用本轮真实产物或结果。证据存在、与当前目标和 diff 对应，且足以复核声明时，本步骤完成。

## Issue 推进

- Plan setup 到达 `ready` 后，以 `claim-issue` 领取直接依赖均已完成的 issue；首次领取保留脚本生成的 issue session。
- 一个 session 串行推进自己领取的 issue。不同 session 可以并行领取互不阻塞的 issue；同一 issue 只有一个有效租约。
- 交付前，issue 的「交付记录」包含交付物与验证证据；脚本据此允许完成状态与 commit receipt。
- 所有 issue 完成后，以 `sync-plan` 刷新派生视图，再按 [`DOMAIN.md`](DOMAIN.md) 处理 Plan 生命周期。

## 租约、阻塞与恢复

- 较长操作用 `heartbeat-plan` 或 `heartbeat-issue` 续租；主动暂停用 `release-plan` 或 `release-issue`。
- 租约过期后用 `claim-plan` 或 `resume-issue` 接管。
- 真实障碍用 `block-issue` 记录原因和可判定的解除条件，并释放租约。
- 异常退出或移动 Plan 后用 `sync-plan` 从 issue frontmatter 重建 spec 派生视图。

每个写命令成功返回后再继续；失败时保留现场，依据错误信息恢复前置条件。

## 持久状态

`.loop/state.json` 保存租约、游标与 receipt；`.loop/state.lock` 只保护单次事务。二者是运行态，不进入版本控制。issue frontmatter 的 `status` 是持久化执行状态的事实源，spec 状态与 Issue 表是派生视图：

```text
pending -> in_progress -> completed
              |
              +-> blocked -> in_progress
```

`blocked` 必须带障碍与解除条件；`completed` 必须带交付物与验证证据，后续修正以新 issue 表达。Plan 的 `active -> reference | archived` 生命周期与执行状态正交。

`flow.mjs` 约束顺序与状态，不证明证据真实性。只有可复核证据与登记结果一致时，Flow 步骤才算完成。
