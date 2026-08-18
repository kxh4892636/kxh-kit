---
status: pending
blocked_by: [01]
---

# GUI 工具

## 交付

`anki-cli gui` 子命令组可用：驱动 Anki 桌面界面完成浏览器、编辑器、复习界面等 11 个界面动作。

## 范围

做：guiBrowse、guiSelectCard、guiSelectedNotes、guiAddCards（预填笔记详情）、guiEditNote、guiDeckOverview、guiDeckBrowser、guiCurrentCard、guiShowQuestion、guiShowAnswer、guiUndo——均为对 AnkiConnect gui* action 的薄透传。

不做：GUI 驱动的组合工作流（用户在 shell 中自行串联）。

## 直接依赖

- 01：消费其 AnkiConnect client、输出归一化与命令分发骨架。

## 验收

- [ ] 单测（mock AnkiConnect）覆盖 11 个工具的参数透传；
- [ ] 真实 Anki 冒烟：`anki-cli gui deck-browser` 打开 Deck Browser，`gui undo` 可用。

## 上下文

- spec：../spec.md
- 参考实现：`.temp/anki-mcp-server/src/mcp/primitives/gui/tools/`

## 下一步

/implement
