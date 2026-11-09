---
name: "011-改note划分原则为交付单元"
description: "把「原子化子任务」改成「可独立验收的交付单元」：同单元返工并入，只有状态需分别表达才拆。"
status: in_progress
related_noted:
  - "010-单会话复用绑定Plan的规则"
next_step: "等用户确认改动后 build/装包，让提示词与 skill 生效。"
---

# 011-改note划分原则为交付单元

交付：固定提示词与 ask skill 的 note 划分口径改为「可独立验收的交付单元」，并用 ADR 记录这次反转的理由。验收：提示词与 skill 文本已改；007/008 维持两条；全工作区 `nano_flow_check` 通过。

## 起因

用户要求「note 尽可能少，相同内容合并」，举 007（三字段提示）与 008（改回深色气泡）为例。核对后确认**不能按主题合并**：

- 面板只显示 `pending / in_progress / blocked`，`completed` 不显示（`contract.ts` 的 `PANEL_STATUSES`）；
- 合并 007+008 后只剩一个 `status`：completed 时整条消失、看不到「还有一项待确认」，blocked 时显示为整条阻塞、而主体已交付；
- 写入成本约等于文件字节数（8 220 → 约 9.7 KB），合并反而让每次更新更贵；省 token 的真正杠杆是批量写（已在 008 定案）；
- 单条 note 有 13 KB 上限，按主题聚合更容易撞上限。

## 改动

| 位置 | 改动 |
| --- | --- |
| `src/nano-flow/prompts/system.md` Plan 段 | 「一条 note 只跟进一个原子化、独立的子任务」→「一条 note = 一个可独立验收的交付单元；同单元内的返工、补测、修正、验证并入原 note；只有验收条件或状态需分别表达时才拆」 |
| `src/nano-flow/skills/ask/SKILL.md` | 「垂直切片」段改为「按交付单元聚合」，并写清拆分判据 |
| `dsh/adr/010-note按交付单元划分.md` | 记录反转理由、三个被比较的方案与后果 |

未做：没有合并 007/008，也没有重编号；历史 note 保留决策链。

## 验证

- `pnpm -C packages/dsh-toolkit test` 与 `check`：见交付回复（本轮只改文本，测试不受影响）。
- `nano_flow_check`（全工作区）：本 note 与 ADR 010 加入后应通过。
- 提示词在插件挂载时读取，改动要 build + 装包 + 重启宿主才生效（本轮按用户要求不 commit、不打包）。

## 相关

- [010-单会话复用绑定Plan的规则](010-单会话复用绑定Plan的规则.md) — 同属 Plan 侧的收口规则。
- [007-为Note面板增加三字段悬浮提示](007-为Note面板增加三字段悬浮提示.md) — 讨论中作为「不该合并」的实例。
- [008-改回深色Tooltip气泡](008-改回深色Tooltip气泡.md) — 同上，其独立验收状态就是拆分理由。
