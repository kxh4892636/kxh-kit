---
name: to-anki
description: Anki 卡片创建任务分流器；当用户要从笔记、Markdown、词表、问答或 cloze 内容创建 Anki 卡片时使用。
---

# To Anki

Route Anki card creation tasks to the right flow. `SKILL.md` is only the dispatcher; do not plan or create cards from this file alone. Load the referenced flow file before doing any detailed work.

## Flow Router

Choose exactly one primary flow for the task. If the task mixes multiple flows, handle them sequentially and preview each flow separately.

| User intent | Route | Load |
|---|---|---|
| Markdown learning notes, wiki learning notes, `inbox/<topic>` notes, chapter files with headings, cards derived from note structure | Learning Notes Basic Cards | `references/learning-notes-basic-cards.md` |
| Vocabulary, word lists, phrase lists, bilingual memorization | Vocabulary Cards | Not implemented yet; ask for desired front/back format, then add a flow before bulk creation |
| Existing summaries converted into direct Q/A cards | Q/A Cards | Not implemented yet; ask for Q/A format, then add a flow before bulk creation |
| Cloze deletion cards or fill-in-the-blank memorization | Cloze Cards | Not implemented yet; ask for cloze template and note type, then add a flow before bulk creation |
| Any other Anki import workflow | New Flow | Ask for source shape, deck mapping, note type, field format, preview format, and verification rule; then add a dedicated reference flow |

## Dispatcher Steps

1. Classify the user's request using the router table.
2. Load the selected reference flow.
3. Follow the loaded flow exactly.
