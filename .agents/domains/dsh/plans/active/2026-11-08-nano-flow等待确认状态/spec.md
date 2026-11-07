# nano-flow 等待确认状态

## 目标

把 `dsh-toolkit` nano-flow 的 `awaiting_verification` 改名为 `waiting`，语义扩为「等待用户确认」（验收与提问都算），并照搬 pi 的 `needs=answer|review`：`waiting` 必须带 `needs`，`complete` 只接受 `waiting + needs=review`；旧值读入折成 `waiting + needs=review`。

## 取证口径

- 现状：`dsh-toolkit` 五态 `pending / in_progress / awaiting_verification / blocked / completed`，`complete` 只接受 `awaiting_verification`。
- 参照：`packages/pi-toolkit/src/orchestrator/dag.ts` 已实现 `waiting` + `NOTE_NEEDS` + `LEGACY_WAITING_STATUS`，`write.ts` 的 status/complete 门槛，`read.ts` 的「等待回答 / 等待验证」分段。
- 落点：dag / check-domain / tools（write、read、shared）/ contract / host ready / client（面板、host-api、stylesheet）/ prompt / README / 领域文档 / 测试。

## 当前进度

- 定案：改 `dsh-toolkit` 的 nano-flow（用户 2026-11-08），照搬 pi 的 `needs`；旧 dsh Plan 已归档，本 Plan 新建。
- 实施：代码、提示词、文档与测试已改；249 项测试、`vp check`、build 通过；0.4.3 → 0.4.4 已装进 desktop profile（安装目录与仓库 dist 同哈希）。详见 note 02 的执行检查点。
- 待重启确认：重启后 `waiting` 在工具 / `resume` / `ready` / 面板生效，旧 `awaiting_verification` 读入折成 `waiting + needs=review`。

## 恢复入口

1. 读 note 01（定案与拷问）与 note 02（落地与检查点）。
2. 重启后确认工具与面板显示「等待确认」；旧值折映射生效。
3. 复验：`nano_flow_check` 的 `workspace` 与 `plan`；把 note 02 置 `waiting` 再 `complete`。
