---
name: "Note侧栏常驻与折叠"
description: "pi-toolkit 的 Note 侧栏改为已绑定 Plan 时常驻（未完成列表可为空并显示空态灰字），边框外右上角加与边框同色的书本图标，点击把整块收成这一个图标。"
status: completed
---

# Note侧栏常驻与折叠

## 需求

用户两条：

1. pi-toolkit 的 Note 侧栏**始终展示**，未完成 note 列表允许为空。
2. 侧栏右上方加一个 icon，点击可展开 / 折叠。

已逐条确认的边界：

- 常驻范围＝**已绑定 Plan**：nano flow 开启且本会话已绑定 Plan 就画框；未绑定、Plan 目录失效仍不显示。
- 空列表的框内形态＝**标题行 + 一行 dim 灰字空态文案**。
- 本轮**只改 pi-toolkit**；dsh 版（`packages/dsh-toolkit/src/client/notes-dock.ts:173`、`src/nano-flow/notes.ts:83`）保留旧行为，两处规则暂时不一致。

## 第二阶段（2026-11-09 追加）

侧栏收口后追加一件事：**Nano Flow 激活时禁用压缩**——自动压缩（阈值 / overflow）与手动 `/compact` 一律取消，理由见 note 004。该 Plan 因此从 reference 迁回 active 继续推进。

## 现状取证（2026-11-09）

侧栏整体消失的三个原因：

- `packages/pi-toolkit/src/nano-flow/register.ts:117` — `snapshotOf` 在 `notes.length === 0` 时返回 `null`。
- `packages/pi-toolkit/src/nano-flow/ui/sidebar.ts:200` — `view()` 在 `snapshot === null || snapshot.notes.length === 0` 时返回 `[]`。
- overlay 的 `visible` 谓词（`sidebar.ts`）——只有 fullscreen 且终端宽度 ≥ `SIDEBAR_MIN_COLUMNS`（110）才出现，**这条不变**。

与旧决策的关系：reference Plan [2026-11-09-pi-toolkit插件](../reference/2026-11-09-pi-toolkit插件/spec.md) 的 note 011 写的是「无绑定、目录失效或**无未完成 note 时不显示**」。本次按用户要求反转其中「无未完成 note 不显示」一条，其余两条保留；011 已 completed，不改它，反转结论落在本 Plan。

## 方案要点

**常驻**：`snapshotOf` 只在无绑定 / 目录失效时返回 `null`；`view()` 永远先产出标题行，列表为空时追加一行 dim 空态文案（`全部完成`）。空态行不是 note 行，不可点击。

**折叠**（经用户四次反馈定稿）：图标是单色 `▤`（原标题前缀那个方块），放在右上角、与侧栏右缘对齐、**与边框同色**（只用 `fg("border", …)`，不加粗），且与上边框**同一行**——它占的就是 `┐` 那一格；点击把**整块收成这一个图标**（边框/标题/note 行全部让出 40 列），再点展开。折叠状态存内存变量、跨 `turn_end` 保留、不落盘（重启恢复展开）。折叠时若详情卡开着则一并关掉。

**边框外不铺空格，格子底色就此作罢**：`pi-tui` 合成 overlay 时强制 `SEGMENT_RESET`，overlay 的每个格子都拿不到底行背景（见 [pi 002 问题](../../../questions/002-overlay格子一律回落到终端默认底色.md)）。因此图标不占框体行，改为**独立 1 列 overlay**（只渲染字形），框体 `margin.top = 2` 让出那一行；两个 overlay 共用一个 `visible` 谓词（fullscreen + 宽度 ≥110 + 有绑定），折叠时框体 `render()` 返回 `[]`，只剩那一格图标。让图标与上边框同行，是为了让它的底色属于卡片轮廓（先经历过 `margin.top = 2` 时图标在边框外、那一格露出默认底色的阶段）；2026-11-09 用户真机走查后按此定稿。

**实现时的边界判定**：

- `refresh()` 原先「`rows` 为空就关详情卡」的判据失效（常驻后 `rows` 恒非空），换成「详情卡所指 note 是否还在新的未完成列表里」。
- 图标行与其它行同为 `SIDEBAR_WIDTH` 列，图标落在最右列；标题行恢复为 `Note · {planName}`，不再带前缀图标。
- 折叠只改变渲染行数，侧栏宽度与右上角锚点不变。

## 验收

- `pnpm --filter @kxh4892636/pi-toolkit check` 与 `test` 通过；`ui.test.ts` 覆盖：空列表仍渲染边框与标题行、点图标折叠后只剩一行图标、再点恢复、`snapshot === null` 仍不渲染。
- 真机（`/reload` 或新会话，无需 `pi install`）：把某个绑定 Plan 的 note 全部置 `completed`，侧栏仍在并显示空态；点右上角图标能收放；未绑定时仍无侧栏。
- Nano Flow 激活时 `/compact` 被取消（交互层提示 `Compaction cancelled`）、关闭后恢复；阈值压缩不再改写上下文。

## 进度

| 项 | 状态 |
| --- | --- |
| 常驻与空态（001） | 已实现，282 项单测通过 |
| 折叠图标（002） | 已实现：与边框同色 + 独立 1 列 overlay + 与上边框同行顶掉 `┐` + 折叠只剩图标 |
| 真机走查（003） | 用户 2026-11-09 回执验收完成 |
| 领域文档 | `packages/pi-toolkit/README.md` 与 `pi/CONTEXT.md` 的 Note 侧栏词条已同步；新增 [pi 002 问题](../../../questions/002-overlay格子一律回落到终端默认底色.md) |
| 禁用压缩（004） | 已实现：三种 `reason` 一律 `{ cancel: true }`，284 项单测通过 |

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
