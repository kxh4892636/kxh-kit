---
name: "Windows测试假红与轮转绑定"
description: "修掉 Windows 上假红的两条单测（layering 的 URL.pathname、plan-log 的 POSIX 字面量），并查清轮转把新会话绑定到已迁 reference 的 music Plan、进而重建幽灵 active 目录的成因。"
status: completed
---

# Windows测试假红与轮转绑定

## 目标

1. **让测试门禁在 Windows 上恢复可信**：`pnpm test`（`vp test src`）在 Windows 上全绿。当前 4 条失败全部是测试自身的平台假设，不是产品代码回归。
2. **查清绑定错位的成因**：新会话轮转后绑定到 `music/plans/active/2026-11-11-自动播放倒计时`，该 Plan 已在 2026-11-13 迁入 `reference`；旧绑定未失效，轨迹写入又重建了只剩 `log.jsonl` 的幽灵目录，导致 `nano_flow_check` 报 `spec.md` 缺失。

## 已知事实（2026-11-13 取证）

- 绑定表 `~/.dsh/toolkit/nano-flow-plan-bindings.json` 里，上一会话 `session-364ac2aa`（boundAt `2026-11-13T11:23:39Z`）与本会话 `session-0ee8c408`（boundAt `11:27:45Z`）都指向 `.agents/domains/music/plans/active/2026-11-11-自动播放倒计时`。
- 该 Plan 的真实文件在 `reference/2026-11-11-自动播放倒计时/`，6 条 note 全 `completed`，spec 记录「2026-11-13 用户确认归档，Plan 从 active 迁 reference」。
- 幽灵目录只有 `log.jsonl`（104 KB、4 条 turn 记录，19:26:44 写入）与 `nano_flow_check` 刚生成的 `notes_index.md`。`plan-log.ts` 的追加写在做 `mkdir(dirname(file), { recursive: true })`，所以向已迁走的路径写轨迹会重建目录。
- 单测现状：`layering.test.ts` 3 条在 Windows 上取源码目录时就 `ENOENT`（`new URL(".", import.meta.url).pathname` 得到 `/C:/...`）；`plan-log.test.ts:279`（`resolvePlanDirectory` 优先绑定 cwd）因 POSIX 字面量 fixture 与 `join` 的 `\\` 分隔符不一致而假红。

## 非范围

- 不改任何播放/校验的产品行为；测试修复只动测试。
- 本 Plan 不重做轮转设计，只查清这一次错位的机制并给出可验证的修法。

## 风险

- 绑定失效不能误伤「Plan 仍有效、只是目录名/生命周期变了」之外的正常绑定；迁移到 reference 的 Plan 仍是合法绑定目标（本 Plan 002 需要结论）。
- 幽灵目录里的 `log.jsonl` 是上一会话唯一的轨迹副本（旧会话已被物理删除），清理前先保留。

## 恢复入口

1. 先读 [notes_index.md](notes_index.md)，按 001 → 002 推进。
2. 关键文件：`packages/dsh-toolkit/src/layering.test.ts`、`packages/dsh-toolkit/src/nano-flow/planning/plan-log.test.ts`、`packages/dsh-toolkit/src/nano-flow/planning/plan-log.ts`、`packages/dsh-toolkit/src/nano-flow/planning/plan-log-service.ts`、会话轮转与 seed 的实现（`packages/dsh-toolkit/src/nano-flow/session/`）。
3. 交付口径：001 以 `pnpm test` 全绿为验收；002 以「错位链条有代码依据、修法可验证」为验收，结论落到 note，稳定结论上浮到 dsh 领域文档。

## 进度

- 2026-11-13：Plan 建立，两条 note 已写；目标来自用户：修复 4 条假红单测、查清轮转绑定到 music 归档 Plan 的原因。
- 2026-11-13 19:30：001 完成，`pnpm test` 375 条全过（Windows）。002 完成：根因是运行中的 0.5.37 自动绑定空壳目录 + 写轨迹重建目录，0.5.50 的过继只按目录存在判断。结论上浮为 [dsh 014](../../../questions/014-轮转为何绑定到已归档Plan.md)。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
