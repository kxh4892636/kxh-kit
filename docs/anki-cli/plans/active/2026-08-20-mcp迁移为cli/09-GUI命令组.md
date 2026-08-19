---
status: pending
blocked_by: ["01"]
---

# GUI 命令组

## 交付

11 条 GUI 子命令（驱动 Anki 桌面界面），行为与上游工具一致：

- `anki-cli gui browse <query> [--order asc|desc --column <id>]` ← guiBrowse；
- `anki-cli gui select <cardId>` ← guiSelectCard；
- `anki-cli gui selected-notes` ← guiSelectedNotes；
- `anki-cli gui add-cards --deck <n> --model <n> --field k=v... [--tag ...]` ← guiAddCards；
- `anki-cli gui edit <noteId>` ← guiEditNote；
- `anki-cli gui deck-overview <deck>` ← guiDeckOverview；
- `anki-cli gui deck-browser` ← guiDeckBrowser；
- `anki-cli gui current-card` ← guiCurrentCard；
- `anki-cli gui show-question` ← guiShowQuestion；
- `anki-cli gui show-answer` ← guiShowAnswer；
- `anki-cli gui undo` ← guiUndo。

## 范围

做：以上 11 条命令 + 单测（假 AnkiConnect 服务器）。命令 help 保留上游双重警告语义（仅编辑/创建流程使用、非复习会话）。
不做：其他分组命令。

## 直接依赖

- 01：消费其命令框架、AnkiConnectClient、types。

## 验收

- [ ] 11 条命令对假服务器的输出 JSON 形状与上游工具 outputSchema 一致（以移植单测为准）；
- [ ] `gui browse` 的 reorderCards 选项正确组装；`gui add-cards` 的 fields/tags 预填正确；
- [ ] 每条命令 help 文本包含「仅编辑/创建流程、非复习会话」警告语义；
- [ ] `vp run @kxh4892636/anki-cli#test` 与 `vp check` 通过。

## 上下文

- 上游实现：`.temp/anki-mcp-server/src/mcp/primitives/gui/tools/gui-*.tool.ts`（11 个文件）。

## 下一步

/implement
