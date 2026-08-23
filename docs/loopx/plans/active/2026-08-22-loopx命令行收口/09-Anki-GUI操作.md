---
status: completed
blocked_by: ["05"]
---

# Anki GUI 操作

## 交付

`loopx anki gui` 承载现有 11 条 Anki GUI 操作，使用者可查询 GUI 状态或驱动 Anki 界面，无需使用旧 `anki-cli` 入口。

## 范围

- 迁移 `gui browse --query [--order --column]`、`select --card-id`、`selected-notes`、`add-cards --deck --model --field... [--tag...]`、`edit --note-id`、`deck-overview --deck`、`deck-browser`、`current-card`、`show-question`、`show-answer`、`undo`。
- 将仅读 GUI 查询定义为 query，将打开/切换/编辑/撤销等 GUI 状态变更定义为 mutation；预演不发出会改变 GUI 状态的 action。
- 保留原 action 映射、参数校验、结果 shape 和 Anki 窗口状态错误 hint。
- 所有原 positional input 改为上述命名 option，各级 help 由同一命令定义生成。

## 直接依赖

- 05: 需要复用 Anki module、AnkiPort、config、query/mutation 和错误契约；消费其 Anki 纵切契约。

## 验收

- [x] 假 AnkiConnect 的 CLI interface 测试覆盖 11 条 GUI 操作的 action/params、成功结果和 GUI 不可用/状态不匹配错误。
- [x] 所有写性 GUI 操作的 `--dry-run` 调用数为 0 且 preview 可判定；只读 GUI 查询在预演中正常执行。
- [x] `loopx anki gui --help` 与全部 leaf `--help` 可在 Anki 离线时运行，旧 positional 写法均以退出码 2 拒绝。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过，原 `@kxh4892636/anki-cli` 测试仍通过。

## 上下文

- [spec](spec.md)
- [GUI 命令参考](../../reference/2026-08-20-mcp迁移为cli/09-GUI命令组.md)

## 下一步

/implement

## 交付记录

交付物：`loopx anki gui` 已承载 11 条 GUI 操作，统一使用命名 option，并保留既有 action、结果与窗口状态错误契约。

验证证据：175 个 LoopX 测试与 168 个旧 Anki CLI 测试通过；LoopX 构建和全仓 `vp check` 通过（31 个既有 warning）；dangling commit `64f06692563b3e17950b95d91907b544a9e1a03f` 的 Standards/Spec 双轴复审均无 blocker。
