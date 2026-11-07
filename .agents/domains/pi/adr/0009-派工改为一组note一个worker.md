# worker:plan 从「同时 1:1」改为「一组 note 一个 worker」

背景：早先的设计（`0007`，以及随之写进 `orchestration/CONTEXT.md` 与 spec 的措辞）把 `worker:plan` 定为"同一 Plan 同一时刻只有一个 worker"。实际使用中瓶颈不在 Plan 层面——同一 Plan 里经常有若干互相没有 `blocked_by` 的 note 可以同时推进，而 1:1 把它们排成了队。

决策：**`worker:plan` 是 1:N**。派工时用一个**组**（一批互相无 `blocked_by` 依赖的 note）作为单位，一组一个 worker；同一 Plan 可同时挂多个组，`pass` / `rework` / `answer` 按 note 路由到持有它的组。句柄键从「plan 目录」改为「plan 目录 + 组标识」，`notes.json` 的写回加进程内按路径的互斥。

理由：note 的依赖关系已经在 DAG 里表达清楚了，`blocked_by` 是天然的并行判据；再在 Plan 层面加一道"只能一个 worker"的限制，等于把 DAG 的信息丢掉再让用户手工拆 Plan。反过来，一条 note 一个 worker 又会让同一批工作的上下文被切碎、每个 worker 都要重新读一遍 Plan。

## Considered Options

- **保持 1:1（原 `0007`）**：实现最简单，但同一 Plan 的可并行 note 只能串行，用户想并行就必须拆 Plan，Plan 变成"执行批次"而不是"一次工作"。
- **一条 note 一个 worker**：路由与放行最直接（`pass` 天然按 note 走），但 worker 数量与上下文开销随 note 数线性增长，同一批 note 的公共调研被重复做。
- **一组 note 一个 worker（选定）**：与"worker 有笔没印"一致——组内由同一个 worker 串行写回，天然避免组内覆盖；组间并行需要一把写锁兜底。

## Consequences

- `handles.ts` 的句柄键变成 `<plan 目录>::<组标识>`（组标识 = note id 排序串），一个 Plan 允许多条条目；省略组时仍是 `<目录>::`，老的 Plan 级派工路径继续可用。
- `orchestrator_dispatch` 新增 `notes`；组内互相有 `blocked_by` 或 note 不存在时直接拒绝派工，不猜。
- `pass` / `rework` / `answer` 必须按 note 找到组：Plan 已分组却找不到对应组时报错，而不是随便投给一个 worker。
- 写回必须有锁：`store.ts` 的 `withDocumentLock` 按 `notes.json` 路径串行化整段"读→改→写"。锁是**进程内**的（worker 与编排方同进程，`createAgentSession` in-process）；跨 pi 实例不在本次范围，那时需要文件锁。
- `orchestrator_workers` 一条一个组，展示 `notes: …`；watchdog 的续期与超时也要按组（report 的 `note` 决定续哪一条句柄）。
- `0007` 中"一个会话编排、多个会话执行"的措辞继续成立，但"同时 1:1"的基数判断被本篇取代；`orchestration/CONTEXT.md`、`pi/CONTEXT.md`、spec、`prompt.md`、`worker.md`、`skills/do` 的并行口径一并改写。
