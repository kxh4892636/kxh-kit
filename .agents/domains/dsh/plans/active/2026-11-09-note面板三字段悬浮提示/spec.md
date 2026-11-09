---
name: "note面板三字段悬浮提示"
description: "Note 面板悬浮到某条 note 时，用提示气泡展示 description、reason（有才显示）与 next_step。"
status: completed
---

# note面板三字段悬浮提示

Note 面板（输入框上方的未完成 note 列表）现在只在悬浮时显示 `description`。用户要能看到「为什么卡着、下一步做什么」，因此悬浮提示改为三字段：`description` + `reason`（阻塞时才显示）+ `next_step`。

## 范围

- [001-为Note面板增加三字段悬浮提示](001-为Note面板增加三字段悬浮提示.md)：契约、宿主快照与客户端提示三处打通。

## 当前结论

- 宿主 `Tooltip` 的气泡是深色（`--dsw-alias-tooltip-bg` + 白字，`white-space: pre-line`），样式无法局部覆盖；`HoverCard` 的 `preview` 变体才是浅色卡片（`--dsw-alias-bg-layer-1` 底 + `--dsw-alias-label-primary` 文字 + 面板阴影），且自带 portal 与定位。因此悬浮提示改用 `HoverCard`（`variant: "preview"`），只保留 `title` 作为宿主缺组件时的兜底。
- 数据链路：note 的 YAML 头 → `readPanelNotes` → `buildNotesSnapshot` → `GET /api/toolkit/nano-flow/notes` → 客户端 `parseNotesSnapshot` → `NotesDock`。新增字段只在这条链上透传，不改存储。
- 宿主 `HoverCard` 把 `anchor` 就地渲染并作为悬浮锚点，卡片走 `createPortal(document.body)`；所以锚点要覆盖整行，否则只有文字区域能触发。
- `HoverCard` 的 `preview` 变体**宽度恒等于锚点宽减 48px**（`kt = min(锚点宽 - 24*2, 视口宽 - 16)`，`fitContent` 在这个分支不生效），因此锚点取整行时卡片就是整行宽；内容必须 `width: 100%` 跟随，不能自带窄 `max-width`。
- `reason` 只在 `blocked` 时存在；`next_step` 在 `completed` 时可省，但 `completed` 的 note 本来就不进面板。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
