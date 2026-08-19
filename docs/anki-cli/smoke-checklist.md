# anki-cli 真实 Anki 验收清单

前提: Anki 已运行并登录 AnkiWeb; AnkiConnect(插件码 2055492159)已安装且监听 `http://localhost:8765`。

**约定**: 所有写操作在专用测试牌组 `anki-cli-smoke` 中执行; 验收完成后执行第 12 步清理。

## 步骤

1. 构建: `vp run @kxh4892636/anki-cli#build`, 然后 `node packages/anki-cli/dist/main.mjs --help` 应列出 9 个命令组 + review。
2. `sync` 输出 `{success:true,...}` 且退出码 0。
3. `decks create anki-cli-smoke` → `created:true` 并返回 deckId。
4. `models list` 输出含 Basic; `models fields Basic` 输出 `[Front, Back]`。
5. `notes add --deck anki-cli-smoke --model Basic --field Front=你好 --field Back=hello --tag smoke` → `success:true` 且 noteId > 0。
6. `notes find "deck:anki-cli-smoke"` 返回上一步的 noteId; `notes info <id>` 的 fields.Front.value 为「你好」。
7. `notes update <id> --field Back=updated` → `success:true`; `notes info <id>` 验证 Back 已变(若不变, 确认笔记未在浏览器中打开——上游已知坑)。
8. `cards list --deck anki-cli-smoke --state new` 返回该卡片; `cards present <cardId> --answer` 的 front/back 正确; `cards rate <cardId> 3` → `success:true`(注意: 对 new 卡评分会进入学习队列)。
9. `tags add <noteId> --tag smoke2` 后 `tags list --pattern smoke` 含 smoke2; `tags replace <noteId> --from smoke2 --to smoke3` 后验证。
10. `media store --filename test.png --file <本地 png 路径>` → `success:true`; `media list --pattern test` 含 test.png; `media get test.png` 的 data 非空。
11. `stats collection` 输出 total_decks ≥ 1 且 counts/states/per_deck 数值合理; `stats review --start <7 天前日期>` 输出 summary.total_reviews ≥ 0。
12. `review --deck anki-cli-smoke --limit 3` 交互式跑一遍(1-4 评分、q 退出、Ctrl+C 汇总)。
13. 清理: `notes find "deck:anki-cli-smoke"` 得到全部笔记 → `notes delete <ids...> --yes` → `media delete test.png --yes` → `decks move` 不需要; 牌组在笔记清空后可通过 Anki GUI 删除 `anki-cli-smoke`(或保留空牌组)。
14. 只读验证: `--read-only notes add ...` 应输出 `{success:false, error:"Action \"addNote\" is blocked..."}` 且退出码 1。

## 判定

- 全部步骤输出 JSON 符合契约(stdout 结果 / stderr 错误 / 退出码 0-1-2);
- 步骤 13 后 `anki-cli-smoke` 无残留笔记与媒体;
- 与 Anki GUI 界面核对: 创建的牌组/笔记/标签/媒体与 CLI 输出一致。
