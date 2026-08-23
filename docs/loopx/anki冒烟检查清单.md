# LoopX 真实 Anki 验收清单

前提: Anki 已运行并登录 AnkiWeb; AnkiConnect(插件码 2055492159)已安装且监听 `http://localhost:8765`。

**约定**: 所有写操作在专用测试牌组 `loopx-smoke` 中执行; 验收完成后执行第 13 步清理。

## 步骤

1. 构建并安装本地包: `vp run @kxh4892636/loopx#build`，再运行 `npm install --global ./packages/loopx`; `loopx --help` 应列出 `self` 与 `anki`。
2. `loopx anki sync` 输出 `{success:true,...}` 且退出码 0。
3. `loopx anki decks create --name loopx-smoke` → `created:true` 并返回 deckId。
4. `loopx anki models list` 输出含 Basic; `loopx anki models fields --name Basic` 输出 `[Front, Back]`。
5. `loopx anki notes add --deck loopx-smoke --model Basic --field Front=你好 --field Back=hello --tag smoke` → `success:true` 且 noteId > 0。
6. `loopx anki notes find --query "deck:loopx-smoke"` 返回上一步的 noteId; `loopx anki notes info --note-id <id>` 的 fields.Front.value 为「你好」。
7. `loopx anki notes update --id <id> --field Back=updated` → `success:true`; `loopx anki notes info --note-id <id>` 验证 Back 已变(若不变, 确认笔记未在浏览器中打开——上游已知坑)。
8. `loopx anki cards list --deck loopx-smoke --state new` 返回该卡片; `loopx anki cards present --card-id <id> --answer` 的 front/back 正确; `loopx anki cards rate --card-id <id> --rating 3` → `success:true`(注意: 对 new 卡评分会进入学习队列)。
9. `loopx anki tags add --note-id <id> --tag smoke2` 后 `loopx anki tags list --pattern smoke` 含 smoke2; `loopx anki tags replace --note-id <id> --from smoke2 --to smoke3` 后验证。
10. `loopx anki media store --filename test.png --file <本地 png 路径>` → `success:true`; `loopx anki media list --pattern test` 含 test.png; `loopx anki media get --filename test.png` 的 data 非空。
11. `loopx anki stats collection` 输出 total_decks ≥ 1 且 counts/states/per_deck 数值合理; `loopx anki stats review --start <7 天前日期>` 输出 summary.total_reviews ≥ 0。
12. `loopx anki review --deck loopx-smoke --limit 3` 交互式跑一遍(1-4 评分、q 退出、Ctrl+C 汇总)。
13. 清理: `loopx anki notes find --query "deck:loopx-smoke"` 得到全部笔记 → `loopx anki notes delete --note-id <id> --yes` → `loopx anki media delete --filename test.png --yes`; 牌组在笔记清空后可通过 Anki GUI 删除 `loopx-smoke`(或保留空牌组)。
14. 只读验证: `loopx anki --read-only notes add --deck loopx-smoke --model Basic --field Front=test --field Back=test` 应输出 `{success:false, error:"Action \"addNote\" is blocked..."}` 且退出码 1。

## 判定

- 全部步骤输出 JSON 符合契约(stdout 结果 / stderr 错误 / 退出码 0-1-2);
- 步骤 13 后 `loopx-smoke` 无残留笔记与媒体;
- 与 Anki GUI 界面核对: 创建的牌组/笔记/标签/媒体与 CLI 输出一致。
