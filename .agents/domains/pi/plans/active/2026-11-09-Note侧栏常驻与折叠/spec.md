---
name: "Note侧栏常驻与折叠"
description: "pi-toolkit 的 Note 侧栏改为已绑定 Plan 时常驻（未完成列表可为空并显示空态灰字），边框外右上角加与边框同色的书本图标，点击把整块收成这一个图标。"
status: in_progress
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

## 现状取证（2026-11-09）

侧栏整体消失的三个原因：

- `packages/pi-toolkit/src/nano-flow/register.ts:117` — `snapshotOf` 在 `notes.length === 0` 时返回 `null`。
- `packages/pi-toolkit/src/nano-flow/ui/sidebar.ts:200` — `view()` 在 `snapshot === null || snapshot.notes.length === 0` 时返回 `[]`。
- overlay 的 `visible` 谓词（`sidebar.ts`）——只有 fullscreen 且终端宽度 ≥ `SIDEBAR_MIN_COLUMNS`（110）才出现，**这条不变**。

与旧决策的关系：reference Plan [2026-11-09-pi-toolkit插件](../reference/2026-11-09-pi-toolkit插件/spec.md) 的 note 011 写的是「无绑定、目录失效或**无未完成 note 时不显示**」。本次按用户要求反转其中「无未完成 note 不显示」一条，其余两条保留；011 已 completed，不改它，反转结论落在本 Plan。

## 方案要点

**常驻**：`snapshotOf` 只在无绑定 / 目录失效时返回 `null`；`view()` 永远先产出标题行，列表为空时追加一行 dim 空态文案（`全部完成`）。空态行不是 note 行，不可点击。

**折叠**（经用户二次反馈定稿）：图标是单色 `▤`（原标题前缀那个方块），放在**边框之上**、与侧栏右缘对齐、**与边框同色**（只用 `fg("border", …)`，不加粗）；点击把**整块收成这一个图标**（边框/标题/note 行全部让出 40 列），再点展开。命中区为图标行右端 3 列。折叠状态存内存变量、跨 `turn_end` 保留、不落盘（重启恢复展开）。折叠时若详情卡开着则一并关掉。

**实现时的边界判定**：

- `refresh()` 原先「`rows` 为空就关详情卡」的判据失效（常驻后 `rows` 恒非空），换成「详情卡所指 note 是否还在新的未完成列表里」。
- 图标行与其它行同为 `SIDEBAR_WIDTH` 列，图标落在最右列；标题行恢复为 `Note · {planName}`，不再带前缀图标。
- 折叠只改变渲染行数，侧栏宽度与右上角锚点不变。

## 验收

- `pnpm --filter @kxh4892636/pi-toolkit check` 与 `test` 通过；`ui.test.ts` 覆盖：空列表仍渲染边框与标题行、点图标折叠后只剩一行图标、再点恢复、`snapshot === null` 仍不渲染。
- 真机（`/reload` 或新会话，无需 `pi install`）：把某个绑定 Plan 的 note 全部置 `completed`，侧栏仍在并显示空态；点右上角图标能收放；未绑定时仍无侧栏。

## 进度

| 项 | 状态 |
| --- | --- |
| 常驻与空态（001） | 已实现，282 项单测通过 |
| 折叠图标（002） | 已实现，按「边框外 + 同边框色 + 折叠只剩图标」定稿 |
| 真机走查（003） | 等用户目视确认三项 |
| 领域文档 | `packages/pi-toolkit/README.md` 与 `pi/CONTEXT.md` 的 Note 侧栏词条已同步 |

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [003-真机走查与验收](003-真机走查与验收.md) | 把改动装进本机 pi、重启后按 spec 验收清单走查：常驻、空态、折叠收放，并把观察结果写回本 note。 | blocked | 等用户在新会话或 /reload 后目视确认三项观察；解除条件＝用户回执三项结果 | 重启 pi 或新开会话后按验收清单自查，并把三项观察回写本 note | 001-侧栏常驻与空态渲染, 002-标题行折叠图标与交互 |
