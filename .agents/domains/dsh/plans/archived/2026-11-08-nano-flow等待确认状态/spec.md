# nano-flow 等待确认状态

## 目标

把 `dsh-toolkit` nano-flow 的 `awaiting_verification` 改名为 `waiting`（等待确认），语义扩为「等待用户确认」（验收与提问都算），并照搬 pi 的 `needs=answer|review`；在此基础上补 `inspect + repair` 的坏文档修复、一条 note 两阶段的约定，并把 ask / do 循环的完整论述下沉到随包 skill。

## 取证口径

- 参照：`packages/pi-toolkit/src/orchestrator/` 的 `dag.ts`（waiting + needs + LEGACY）、`write.ts`（status/complete 门槛、repair）、`read.ts`（inspect、等待回答/等待确认）、`prompt.md` 与 `skills/ask|do`（循环下沉）。
- 落点：dag / check-domain / tools（write、read、shared、store）/ contract / host ready / client（面板、host-api、stylesheet）/ prompt / skills / README / 领域文档 / 测试。

## 结论摘要

- 五态改为 `pending / in_progress / waiting / blocked / completed`；`waiting` 带 `needs=answer|review`，旧值读入折成 `waiting + review`。
- `inspect` 给原始视图、`repair` 应用模型修正后重校验；工具不自动截断摘要或删索引项。
- 一条 note 走两阶段：`waiting/answer` 定案 → `in_progress` 实施 → `waiting/review` 完成，默认不拆两条。
- prompt 212 → 92 行：ask / do 循环规格移到 `skills/ask`、`skills/do`，prompt 只留模式判定与指针。

## 当前进度

- 5 条 note 全部完成（01 定案、02 waiting 落地、03 inspect/repair、04 两阶段、05 循环下沉）。
- 0.4.5 已装进 desktop profile；重启后真机确认：`resume` 显示 `waiting 2` 与「等待确认」、`[waiting/review]`、`inspect` 可用、`repair` 写入成功、挂载诊断 promptBytes 10,810（92 行指针版）、rotation 四服务 true。
- 250 项测试、`vp check`、build 通过；提交 f3114043、4e9f3cf3、42cae85f 与后续收尾提交。

## 恢复入口

1. 读 note 02–05 的检查点与证据；定案与拷问见 note 01。
2. 复验：`nano_flow_check` 的 `workspace` 与 `plan`；`resume` 确认状态与队列。
3. 2026-11-08 按用户要求把 Plan 迁到 `archived`（5 条 note 全部完成）；恢复时先 `move` 回 `active`。
