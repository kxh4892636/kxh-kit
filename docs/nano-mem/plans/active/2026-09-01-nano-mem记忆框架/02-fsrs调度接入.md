---
status: pending
blocked_by: []
---

# FSRS 调度接入

## 交付

记忆的 FSRS 生命周期可用：首次写入按 Good 初始化卡片；每次记使用（again/hard/good/easy）经 `ts-fsrs` 更新 stability/difficulty/due/reps/lapses/state，并可即时计算可检索性 R——使用频率越高 S 单调上升、久不用 R 衰减的核心闭环由库级函数承担并通过单测锁定。

## 范围

- 依赖 `ts-fsrs ^5.4.1` 装入包；`src/fsrs.ts` 封装：`createMemoryScheduler()`（`enable_short_term: false` 纯长时调度）、`initialCard()`（createEmptyCard）、`initReview(card, now)`（首次按 Good 推进 New→Review，产出初始 S0/D0）、`recordUse(card, grade, now)`（`next()`）、`retrievability(card, now)`、card 与存储字段互转（duration/due ISO、fsrs_state 整数）。
- 单测：初始化后 S0>0；连续 Good 复习 S 单调上升；模拟「久不用」（now 前进）R 单调下降；Again 后 lapses+1 且 S 下降；与存储层无耦合（纯函数测试）。
- 不做：CLI、评分公式、状态机（issue 04）、弱使用/强使用的自动记账（issue 03/04）。

## 直接依赖

- 无（根 issue；与 01 并行，互不依赖——fsrs.ts 为纯函数模块）。

## 验收

- [ ] `pnpm --filter @kxh4892636/nano-mem test` 通过；fsrs.ts 覆盖率 ≥80%。
- [ ] 测试证明：`recordUse(Good)` 序列后 stability 严格单调上升；时间推进 60 天后 R 低于初始 R（或单调下降）。
- [ ] `ts-fsrs` 以 `enable_short_term: false` 初始化（测试断言调度器行为为长时路径，无分钟级 due）。

## 上下文

- [spec](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/spec.md) 实施决策「FSRS 封装」
- `.temp/ts-fsrs/` — 参考实现（README_CN、src/fsrs.ts、long-term.ts）
- [CONTEXT 使用/使用评级](../../../docs/nano-mem/CONTEXT.md)

## 下一步

决策已澄清：/code-delivery
