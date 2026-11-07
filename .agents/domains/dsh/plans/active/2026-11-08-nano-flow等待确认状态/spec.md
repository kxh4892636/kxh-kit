# nano-flow 等待确认状态

## 目标

把 `dsh-toolkit` nano-flow 的 `awaiting_verification` 改名为 `waiting`（等待确认），语义扩为「等待用户确认」（验收与提问都算），并照搬 pi 的 `needs=answer|review`；在此基础上补 `inspect + repair` 的坏文档修复、一条 note 两阶段的约定，并把 ask / do 循环的完整论述下沉到随包 skill。

## 取证口径

- 参照：`packages/pi-toolkit/src/orchestrator/` 的 `dag.ts`（waiting + needs + LEGACY）、`write.ts`（status/complete 门槛、repair）、`read.ts`（inspect、等待回答/等待确认）、`prompt.md` 与 `skills/ask|do`（循环下沉）。
- 落点：dag / check-domain / tools（write、read、shared、store）/ contract / host ready / client（面板、host-api、stylesheet）/ prompt / skills / README / 领域文档 / 测试。

## 当前进度

- 定案：改 `dsh-toolkit` 的 nano-flow（用户 2026-11-08），照搬 pi 的 `needs`；旧 dsh Plan 已归档，本 Plan 新建。
- note 02（waiting 改名）实施完成：249 测试、`vp check`、build 通过；0.4.3 → 0.4.4 已装，待重启确认。
- note 03（inspect + repair）完成：原始视图 + 模型修正后重校验，坏文档可修；`runtime.test` 覆盖整条链路。
- note 04（一条 note 两阶段）完成：prompt 与 ask skill 口径一致。
- note 05（ask / do 下沉）完成：prompt 212 → 92 行，循环规格在 `skills/ask`、`skills/do`；250 项测试通过。
- 当前 0.4.5 已构建待装（含 03/04/05）；安装后重启确认 waiting、inspect/repair、循环加载。

## 恢复入口

1. 读 note 02（waiting 落地）、03（inspect/repair）、04（两阶段）、05（循环下沉）。
2. 装 0.4.5 并重启：确认 `status=waiting` + needs、`resume` 分「等待回答 / 等待确认」、`inspect` / `repair` 可用、prompt 只留指针。
3. 复验：`nano_flow_check` 的 `workspace` 与 `plan`；把 note 02–05 逐个 `complete`。
