---
name: '011-Note侧栏与详情卡'
description: 'fullscreen 右上角 Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名，点击出概述/原因/下一步详情卡。'
status: 'completed'
related_noted: ['012-测试与验收']
---

# Note 侧栏与详情卡

## 交付

- 简化旧 orchestrator 的 overlay：去掉 worker 分组、实时流与定时轮询；保留 40 列右上角与 Esc 关闭。
- 只显示 `pending / in_progress / blocked` 的 note；行 = 中文状态 + note 名；无绑定、目录失效或无未完成 note 时不显示。
- 点击行打开详情卡：标题行右端带 `×`，正文依次是概述、`原因：`、`下一步：`；点击 `×` 或 Esc 关闭。
- 详情卡悬浮在所点 note 行的左下侧：顶端与该行对齐，右缘在侧栏左缘左侧 2 列（`DETAIL_GAP`），由点击事件的 `screenX/screenY` 算出 `row/col`，不再居中。
- `turn_end` 时重读磁盘一次；`/nano-flow on`、session_start 也刷新；regular 模式不挂载。

## 验收

fullscreen 下侧栏随绑定 Plan 出现；点击条目出卡片，卡片在 note 行左下侧且标题行右端有 `×`；点击 `×` 或 Esc 关闭；regular 模式无侧栏且不报错。


## 结果

- 已实现并通过 `pnpm --filter @kxh4892636/pi-toolkit test`（221 项）与 `check`。
- 2026-11-09 首次走查（用户反馈）：
  1. 卡片右上角没有 `×` → 标题行末尾补 `×`，点击末 3 列即关闭（`handleMouse`）。
  2. 卡片居中不好用 → 改为悬浮在所点 note 行左下侧（`row` = 点击行，`col` = 侧栏左缘 − 48 − 2），去掉 `anchor: center`。
- 顺带修掉一处旧缺陷：标题行比上下边框窄 2 列（46 vs 48），现所有行都是 48 列，单测用 `visibleWidth` 盯住。
- 改动位置：`src/nano-flow/ui/sidebar.ts`（`cardLines` / `createDetailCard` / `detailOrigin` / `openDetail`）、`ui.test.ts`。
- 待用户重新走查：`×` 点击、卡片位置、Esc、`turn_end` 刷新。
- 2026-11-09 第二轮走查：用户确认全部通过，本条置 `completed`。
