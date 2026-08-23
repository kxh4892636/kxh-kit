---
status: completed
blocked_by: ["05"]
---

# Anki 笔记与笔记类型操作

## 交付

`loopx anki` 完整承载笔记和笔记类型的查询、创建、修改和删除能力，所有业务输入均通过命名 option 表达。

## 范围

- 迁移笔记操作：`notes add`、`add-batch --input <path|->`、`find --query <query>`、`info --note-id <id>...`、`update --id <id>`、`delete --note-id <id>... --yes`；保留 fields/tags/duplicate 等原 options 和部分成功语义。
- 迁移笔记类型操作：`models list`、`fields/styling/templates --name`、`create --name --field... --templates`、`update-styling --name --css`、`update-templates --name --templates`、`field-add --name --field [--index]`、`field-remove --name --field --yes`、`field-rename --name --old-name --new-name`、`field-reposition --name --field --index`。
- `--input <path|->`、`--css <path|->` 等所有 stdin/文件输入都由命名 option 选择；文件读取通过 module internal seam，不直接访问全局 `process`。
- 写操作定义可判定 preview；破坏性操作仍需 `--yes`，预演不绕过输入和确认校验。

## 直接依赖

- 05: 需要复用 Anki module、AnkiPort、config、命令命名和迁移测试范式；消费其 Anki 纵切契约。

## 验收

- [x] 假 AnkiConnect 的 CLI interface 测试覆盖全部笔记/笔记类型操作、复杂输入、部分成功、破坏性确认、结果 shape 和错误 hint。
- [x] 每个旧 positional input 的对应新 option 有正向测试，旧写法有退出码 2 的反向测试；各级 `--help` 列出必填性。
- [x] 所有写操作预演的 AnkiConnect 写 action 和本地文件写入数均为 0，preview 包含 action/params 或文件计划。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过，原 `@kxh4892636/anki-cli` 测试仍通过。

## 上下文

- [spec](spec.md)
- [笔记命令参考](../../reference/2026-08-20-mcp迁移为cli/03-笔记命令组.md)
- [笔记类型命令参考](../../reference/2026-08-20-mcp迁移为cli/05-模板命令组.md)

## 下一步

/implement

## 交付记录

交付物：迁移 6 个 notes 与 11 个 models 命令，统一命名 option、prepare 校验、文件/stdin seam、AnkiConnect 响应 schema 和结构化错误。

验证证据：LoopX 97/97、旧 anki-cli 168/168；LoopX build/check 通过，全仓 check 0 error（31 个既有 warning）；dangling commit `bcac23237a4b246d482a635a5809d275a0d76f82` 的 Standards/Spec 双轴复审均无 blocker。
