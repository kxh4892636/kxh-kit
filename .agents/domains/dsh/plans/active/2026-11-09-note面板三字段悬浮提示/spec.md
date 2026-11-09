---
name: "note面板三字段悬浮提示"
description: "Note 面板悬浮到某条 note 时，用提示气泡展示 description、reason（有才显示）与 next_step。"
status: in_progress
---

# note面板三字段悬浮提示

Note 面板（输入框上方的未完成 note 列表）现在只在悬浮时显示 `description`。用户要能看到「为什么卡着、下一步做什么」，因此悬浮提示改为三字段：`description` + `reason`（阻塞时才显示）+ `next_step`。

## 范围

- [001-为Note面板增加三字段悬浮提示](001-为Note面板增加三字段悬浮提示.md)：契约、宿主快照与客户端提示三处打通。

## 当前结论

- 宿主 `Tooltip` 的气泡样式是 `white-space: pre-line` 且 `position: fixed`（宿主 `index-*.css` 的 `._bubble_44yfq_1`），因此**标签里的换行会渲染成换行、也不会被面板的 `overflow: hidden` 裁掉**，不需要自己画气泡或开 portal。
- 数据链路：note 的 YAML 头 → `readPanelNotes` → `buildNotesSnapshot` → `GET /api/toolkit/nano-flow/notes` → 客户端 `parseNotesSnapshot` → `NotesDock`。新增字段只在这条链上透传，不改存储。
- `reason` 只在 `blocked` 时存在；`next_step` 在 `completed` 时可省，但 `completed` 的 note 本来就不进面板。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [001-为Note面板增加三字段悬浮提示](001-为Note面板增加三字段悬浮提示.md) | 悬浮某条 note 时显示 description、reason（有才显示）与 next_step；宿主 Tooltip 按 pre-line 渲染多行。 | blocked | 等待真机验收：0.5.40 已装进 web profile，重启宿主后悬浮检查三字段气泡 | 重启宿主 → 新建 nano-flow 会话 → 展开 Note 面板，悬浮阻塞行与普通行各一次，确认三行/两行文本。 | — |
