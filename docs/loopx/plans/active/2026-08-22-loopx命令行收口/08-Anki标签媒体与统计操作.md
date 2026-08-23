---
status: completed
blocked_by: ["05"]
---

# Anki 标签媒体与统计操作

## 交付

`loopx anki` 承载标签、媒体和统计能力，保留媒体安全与统计聚合语义，并为 AnkiConnect 与本地文件写入提供可判定预演。

## 范围

- 迁移标签操作：`tags list`、`add/remove --note-id <id>... --tag <tag>...`、`replace --note-id... --from --to`、`clear-unused --yes`。
- 迁移媒体操作：`media list [--pattern]`、`get --filename [--out]`、`store (--file|--url|--data) [--filename] [--delete-original]`、`delete --filename --yes`；保留 SSRF、路径穿越、MIME 和删除原文件校验。
- 迁移 `stats collection` 和 `stats review --start <date> [--end] [--deck]`，保留牌组聚合、保持率与连续天数语义。
- 本地文件读写使用 media module internal seam；`media get` 在指定 `--out` 时是 mutation，否则是 query。

## 直接依赖

- 05: 需要复用 Anki module、AnkiPort、只读守卫、query/mutation 和安全错误契约；消费其 Anki 纵切契约。

## 验收

- [x] 假 AnkiConnect 的 CLI interface 测试覆盖全部标签、媒体和统计操作，结果 shape 与原实现一致。
- [x] 媒体测试覆盖 URL SSRF、路径穿越、不允许 MIME、互斥来源、输出文件与删除原文件，使用临时目录不触碰用户媒体。
- [x] 所有 Anki/文件写操作预演时写调用数为 0，preview 同时列出远程 action 和本地文件效果。
- [x] 所有原 positional input 均改为命名 option，各级 help 与用法错误测试通过。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过，原 `@kxh4892636/anki-cli` 测试仍通过。

## 上下文

- [spec](spec.md)
- [标签命令参考](../../reference/2026-08-20-mcp迁移为cli/06-标签命令组.md)
- [媒体命令参考](../../reference/2026-08-20-mcp迁移为cli/07-媒体命令组.md)
- [统计命令参考](../../reference/2026-08-20-mcp迁移为cli/08-统计命令组.md)

## 下一步

/implement

## 交付记录

交付物：`tags`、`media` 与 `stats` 命令组，包含命名 option、媒体条件 query/mutation、SSRF/MIME/目录白名单、文件边界 seam、统计聚合和可判定 dry-run。

验证证据：145 个 LoopX 测试与 168 个旧 Anki CLI 测试通过；LoopX 构建和全仓 `vp check` 通过（31 个既有 warning）；dangling commit `0bd35f0c562015889e40528afbc425c5765cbb57` 的 Standards/Spec 双轴复审均无 blocker。
