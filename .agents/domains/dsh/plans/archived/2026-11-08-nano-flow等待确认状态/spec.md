---
name: 'nano-flow等待确认状态'
description: '把 `dsh-toolkit` nano-flow 的 `awaiting_verification` 改名为 `waiting`（等待确认），语义扩为「等待用户确认」（验收与提问都算），并照搬 pi 的 `needs=answer|review`；在此基础上补 `inspect + repair` 的坏文档修复、一条 note 两阶段的约定，并把 ask / do 循环的完整论述下沉到随包 skill。'
status: completed
---

# nano-flow等待确认状态

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 旧 story

## US-001 等待确认状态

作为推进 Plan 的我，希望「等待验证」变成 `waiting`（等待确认），把等验收与等用户回答都表达出来，以便任何「在等用户」的事都在同一个状态里可见。

## US-002 区分等什么

作为看面板的人，希望看到 note 在等回答还是等验收，以便知道下一步该我答问题还是看结果。

## US-003 修复坏文档

作为推进 Plan 的我，希望 `notes.json` 校验失败时能用 `inspect` 看原始内容、用 `repair` 提交修正后恢复，以便不靠手改文件就能救回 Plan。

## 非目标

- 不改 pi-toolkit 的编排模型（它已经是 `waiting + needs`）。
- 不改已归档 Plan 的历史内容；旧值只做读入兼容。


## 旧 spec

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

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
