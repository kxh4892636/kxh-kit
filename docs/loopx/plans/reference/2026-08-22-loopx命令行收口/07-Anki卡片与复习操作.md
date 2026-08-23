---
status: completed
blocked_by: ["05"]
---

# Anki 卡片与复习操作

## 交付

`loopx anki` 承载卡片查询、呈现、评分、同步和交互式复习闭环，复习会话通过 CLI kernel 的输入/事件 interface 运行。

## 范围

- 迁移 `cards due`、`cards list`、`cards present --card-id <id> [--answer]`、`cards rate --card-id <id> --rating <1-4>`，保留调度、渲染、cloze/reversed 与 nextReview 语义。
- 迁移 `anki sync` 和 `anki review [--deck] [--limit] [--include-new] [--no-sync]`。
- 复习会话通过 `InvocationContext` 读取 `1-4` / `q`，通过 JSON 事件流输出 sync、问题、评分错误/结果和最终汇总，正常收敛 EOF/SIGINT。
- `rate`、`sync`、`review` 是 mutation；复习预演可拉取到期卡片生成计划，但不 sync 且不提交评分。

## 直接依赖

- 05: 需要复用 Anki module、AnkiPort、config、query/mutation 与 JSON 输出契约；消费其 Anki 纵切契约。

## 验收

- [x] 假 AnkiConnect 的 CLI interface 测试覆盖到期/状态查询、渲染卡片、评分、同步与完整复习会话，结果与原 structuredContent/会话事件一致。
- [x] 复习会话在非法评分、单卡错误、`q`、EOF 和 SIGINT 下均有确定 JSON 序列与汇总，业务 module 不直接访问 `process`。
- [x] `rate/sync/review --dry-run` 不发出 AnkiConnect 写 action；只读卡片查询在预演中正常执行。
- [x] 所有原 positional input 均改为命名 option，各级 help 与用法错误测试通过。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过，原 `@kxh4892636/anki-cli` 测试仍通过。

## 上下文

- [spec](spec.md)
- [卡片命令参考](../../reference/2026-08-20-mcp迁移为cli/04-卡片复习命令组.md)
- [复习会话参考](../../reference/2026-08-20-mcp迁移为cli/10-交互式复习与文档.md)

## 下一步

/implement

## 交付记录

交付物：`cards due/list/present/rate`、`sync` 与 review JSON 事件流，包含命名 option、负向 option、stdin/SIGINT adapter、dry-run 预检和旧 read-only 调度豁免。

验证证据：117 个 LoopX 测试与 168 个旧 Anki CLI 测试通过；LoopX 构建和全仓 `vp check` 通过（31 个既有 warning）；dangling commit `da82e6f1b505154774ee2ae81a2ba409f155dbb2` 的 Standards/Spec 双轴复审均无 blocker。
