# anki牌组删除

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 anki牌组删除

`nnf anki decks` 目前只有 `list` / `stats` / `create` / `move`，桌面端能做的牌组清理在 CLI 上没有出口。需要让 CLI 能删除牌组（连同其卡片与子牌组），并保持既有安全基线：不可逆操作需显式确认、JSON-only 输出、只读模式拦截、`--dry-run` 可预演。

已知约束：

- AnkiConnect `deleteDecks(decks, cardsToo)` 强制 `cardsToo=true`，否则报错 `Since Anki 2.1.28 it's not possible to delete decks without deleting cards as well`；成功返回 `null`；对不存在的牌组名静默忽略。
- 删除牌组会级联删除其全部子牌组（本机 Anki 26.8.1 + AnkiConnect 实测）。
- 本机 `nnf` 是 `packages/nano-flow` 的本地打包全局安装（README「本地打包与安装」），包未发布到 registry。
