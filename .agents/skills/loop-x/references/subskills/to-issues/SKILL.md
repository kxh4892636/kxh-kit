---
name: to-issues
description: 把 /grill-with-docs 扩展为长任务的可恢复领域 Plan：持续维护 spec、设计 frontier 与 tracer-bullet issue 图；当工作需要跨会话推进，或单会话内仍需持久化检查点时使用。
argument-hint: "要持久化并推进什么长任务?"
---

# To Issues

`/to-issues` 是 `/grill-with-docs` 面向长任务的持久化版本。二者都通过拷问清空设计 frontier，并把已确认的领域语言和长期 trade-off 写回领域文档；区别是 `/to-issues` 还把当前问题、方案、待定项与交付状态外化为 Plan，使任务不依赖对话记忆即可继续。跨会话任务和单会话长任务使用同一机制。

完整读取 [`DOMAIN.md`](../../DOMAIN.md)，以其中的领域布局和 Plan 生命周期为权威约束。`/grill-with-docs` 拥有 `CONTEXT-MAP.md`、`CONTEXT.md` 与 ADR 的维护规则；`/to-issues` 只拥有 Plan 内的 spec、issue graph 与执行状态，不复制领域结论。本 skill 有两个 branch：建立或维护 Plan；推进已通过准入的 Plan。

每轮结束前，把已确认结论、未决 frontier、状态与证据写入各自的权威文件。下一位 agent 仅阅读领域文档、Plan 与 Flow 运行态，就能重建为什么做、当前做到哪里、下一步是什么时，检查点才成立。

## 建立或维护 Plan

### 1. 定域并建立检查点

从 `CONTEXT-MAP.md` 定位一个 owner 域，读取该域 `CONTEXT.md`、相关 ADR、story、现有 Plan 与实现证据。跨域工作先确认关系与唯一 owner，或按 owner 拆成多个 Plan。新 Plan 使用 `docs/{domain-name}/plans/active/YYYY-MM-DD-中文工作名/`。

写入前完整读取 [`TEMPLATE.md`](TEMPLATE.md)，创建或载入 `spec.md`。先记录已知问题、当前方案、范围、上下文与设计 frontier；尚未确认的内容留在「待定」，不提前派生为 issue。

完整读取 [`FLOW.md`](../../FLOW.md)。顶层直接调用时进入固定 `issues` 路径；从 `/loop-x` 或 `/to-story` 收到 context 时直接复用。登记 `/to-issues=started`，把 context 传给脚本返回的 `/grill-with-docs` required child。child 负责清空本轮领域设计 frontier 并维护共享领域文档；child 完成后只恢复脚本返回的 `/to-issues`，再把 Plan 局部结论同步到 spec。

owner、Plan 路径、初始设计 frontier 和 Flow 位置均已持久化，且 `/grill-with-docs` 已用同一 context 登记完成时，本步骤完成。

### 2. 构造 tracer-bullet graph

把已确认结论就地映射到 spec 与 issues：

- spec 拥有问题、方案、已排除备选、实施决策、边界、环境、待定项和 issue 派生表；issue 拥有该交付单元的交付、直接依赖、验收与证据。
- 仍会改变 issue 边界、依赖或验收的决策保留在「待定」；只有结论确认后才 graduate 为 issue。
- 一个 tracer bullet 交付完整的用户结果或业务能力，只贯穿该结果必需的层级；直接依赖成立后可独立实现、提交和验收。
- issue 从 `01` 按依赖顺序连续编号，编号是稳定 ID；每条依赖只记录直接前驱，并说明消费的产物或契约。
- 每个 issue 以一个可独立判定的结果作为最小验收信号，下一步固定为 `/implement`。
- 使后续交付更容易的 prefactoring 排在最前。大范围机械迁移使用 expand → 分批 migrate → contract 的序列，每批单独成为 issue。
- `/code-test` 与 `/verifying` 的最小质量门禁作为 Plan 基线候选明确记录，留给 `/dev-gate` 确认。

每项范围只有一个 owner issue、每个 issue 只有一个完整交付责任、依赖图至少有一个根且无自环或环、所有会影响交付的设计 frontier 均已清空时，本步骤完成。

### 3. 校验并交接

从工作区根运行：

```powershell
node <loop-x-skill-dir>/script/check-domain.mjs .
```

校验通过，全部 issue 为 `pending`，用户确认边界与依赖图，且仅凭领域文档、Plan 与 Flow 运行态即可恢复工作后，以 `spec.md` 为证据登记 `/to-issues=completed`，只执行脚本返回的下一步。

若本轮无法达到上述完成标准，先更新 spec 中的已确认结论与「待定」，再按 `FLOW.md` 续租或释放 Plan；不得用未清空的 frontier 登记 `completed`。

## 推进 Plan

完整读取 [`FLOW.md`](../../FLOW.md)，并按运行态推进：

1. 从 `plans/active/` 的 spec 派生表定位 `pending` 且直接依赖全部 `completed` 的 frontier；有多个候选时使用用户已确认的优先级。
2. 领取一个 issue，在同一 session 内交付或形成真实 blocked 结果；当前 issue 结束后才领取下一个。
3. 新发现的事实更新 spec；新发现的工作建立新 issue，尚不能精确表述的设计 frontier 进入 spec「待定」。当前 issue 的边界保持不变，符合 ADR 资格的长期 trade-off 由 `/grill-with-docs` 写入领域文档。
4. 每次暂停前同步 issue 状态、spec 派生视图与证据，并按 `FLOW.md` 续租或释放；恢复时只信任文件与运行态，不依赖先前对话。
5. 全部 issue 完成后与用户确认参考价值，把整个 Plan 移入 `reference/` 或 `archived/`，执行 `sync-plan` 并重新运行领域校验。

一个领取结果有且只有一个终态、状态与 spec 派生视图一致、证据链可复核时，本轮推进完成。
