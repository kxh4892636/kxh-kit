---
status: completed
blocked_by: ["01"]
---

# Anki 纵切与牌组操作

## 交付

`loopx anki` 的首个完整纵切：使用者可通过命名 options 列出、查看、创建和移动牌组/卡片，从 CLI 穿过 AnkiConnect port 获得与原 Anki CLI 等价的 JSON 结果。

## 范围

- 建立 `anki` 内建 module，迁入 Anki config、logger、client、错误分类、串行化、重试、背压与只读守卫；保留原 `packages/anki-cli` 可用形态。
- 定义 Anki module 内部 `AnkiPort.invoke(action, params)` seam；production 装配 HTTP adapter，测试装配假 AnkiConnect。help 和用法错误不建立连接。
- 迁移牌组操作：`decks list [--stats]`、`decks stats --deck <name>`、`decks create --name <name>`、`decks move --deck <name> --card-id <id>...`。
- `list` / `stats` 是 query；`create` / `move` 是 mutation，预演输出 AnkiConnect action/params 计划且零写 action。
- Anki scoped options 保留 `--anki-connect`、`--read-only`、`--debug`、`--compact` 及现有 env 覆盖规则。

## 直接依赖

- 01: 需要将 Anki 作为内建 module 注册并复用统一执行契约；消费其 `BuiltinCommand`、operation、scoped/global options、JSON 事件和 help interface。

## 验收

- [x] 假 AnkiConnect 的 CLI interface 测试验证 4 条牌组操作的 action/params、结果 shape、错误 hint、只读守卫、重试与背压契约。
- [x] `loopx anki --help`、`loopx anki decks --help` 和四个 leaf `--help` 在 Anki 离线时仍成功；任一旧 positional 写法均以用法错误退出。
- [x] `decks create/move --dry-run` 的写 action 调用数为 0，`decks list/stats --dry-run` 仍返回真实查询结果。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过，原 `@kxh4892636/anki-cli` 测试仍通过。

## 上下文

- [spec](spec.md)
- [Anki 领域术语](../../../CONTEXT.md)
- [Anki 参考 plan 的牌组命令](../../reference/2026-08-20-mcp迁移为cli/02-牌组命令组.md)
- [`packages/anki-cli` 命令注册](../../../../../packages/anki-cli/src/cli/program.ts)

## 下一步

/implement

## 交付记录

交付物：`loopx anki decks` 的 list/stats/create/move 命令、AnkiConnect port 与 HTTP adapter、配置/诊断日志、串行重试背压、只读与 dry-run 安全边界。

验证证据：53 个 LoopX 测试与 168 个旧 Anki CLI 测试通过；LoopX 构建通过；全仓 `vp check` 为 0 error（31 个既有 warning）；Standards/Spec 双轴审查均无 blocker。
