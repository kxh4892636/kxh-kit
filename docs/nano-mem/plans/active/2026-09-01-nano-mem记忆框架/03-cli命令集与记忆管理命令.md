---
status: completed
blocked_by: ["01", "02"]
---

# CLI 命令集与记忆管理命令

## 交付

`nm` CLI 可用：记忆管理命令 `add/get/list/use/delete/stats` + 全局选项（--json/--db/--agent/--run/--dry-run/--help/--version）+ 人类可读默认输出与 JSON 契约、退出码 0/1/2；add 即初始化 FSRS 卡片，use 走 FSRS 复习——「写入 + 使用记账 + 删除」的完整数据通路端到端可用。

## 范围

- `src/main.ts` 入口 + `src/cli.ts`：参数解析（node util.parseArgs 或等价）、命令分派、帮助/版本、退出码（2=用法错误、1=运行时错误、0=成功）；`--json` 时 stdout 成功 JSON / stderr 错误 JSON（含 hint）。
- 命令语义：
  - `add <text>`：去重；run_key 归一（run ?? ''）；tags/meta 解析（--tag 可重复、--meta k=v 可重复）；初始化 FSRS（首次 Good 复习）。
  - `get <id>` / `list`（--agent/--run/--tag/--limit/--state 基础过滤）输出文本或 JSON。
  - `use <id> --grade`：更新 FSRS 字段与 last_review（弱使用/强使用评级复用同一路径）。
  - `delete <id>`：软删除 → state=trashed + trashed_at。
  - `stats`：总数/状态分布/FSRS 概览。
- 集成：`--agent` 默认当前工作目录名（process.cwd() basename）；`--db` 默认 env `NANO_MEM_DB` → `~/.nano-mem/mem.db`（目录自动创建）。
- 冒烟级测试（vitest，覆盖 CLI 命令主路径 + 存储集成）。
- 不做：search、检索评分、休眠/已删状态机判定（issue 04）；self（issue 06）；skill/README（issue 05）。

## 直接依赖

- 01: 存储层与 schema；消费其 store.ts 的 add/get/list/delete/stats 能力与 DB 路径解析。
- 02: FSRS 封装；消费 initialCard/initReview/recordUse/retrievability，保证每次 use 后卡片状态正确持久化。

## 验收

- [ ] `nm add "文本" --tag t --meta k=v` 成功；重复 add 返回既有 id；`nm get <id>` 读回原文与标签/元数据。
- [ ] `nm use <id> --grade good` 后 `nm get <id>` 显示 stability/reps/last_review 已更新（与 issue 02 行为一致）。
- [ ] `nm delete <id>` 后 `nm list` 默认不含该条，`nm get` 可读且 state=已删语义字段正确（trashed_at 非空）。
- [ ] `--json` 输出可解析；用法错误退出码 2 且 stderr 为 JSON 错误；运行时错误退出码 1。
- [ ] `--help`/`--version` 正常；`NANO_MEM_DB` 指向自定义路径时数据写入该路径。

## 上下文

- [spec](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/spec.md) 实施决策「CLI 契约」
- [story US-001/US-003](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/story.md)
- [CONTEXT 使用/使用评级/记忆标签](../../../docs/nano-mem/CONTEXT.md)

## 下一步

决策已澄清：/code-delivery

## 交付记录

- 交付物：`src/cli.ts`（runCli(argv, env) 命令分派/输出/错误契约）+ `src/cli.spec.ts`（35 测试）+ `src/main.ts` 薄壳（shebang + 进程接线）+ `src/store.ts` 新增 `updateFsrs` + `vitest.config.ts` exclude main.ts；commit `6e28c20`（A：feat/nano-mem）。
- 验证证据：`pnpm --filter @kxh4892636/nano-mem test` 66/66 passed；覆盖率 statements/branches/functions/lines = 95.25/89.38/98.87/95.17（≥80）；`vp check` pass（13 files、0 lint/type errors）；`build` 后 `node dist/main.mjs --version` → 0.1.0（exit 0）。
- 验收点证据（临时 db 冒烟）：add→重复 add 返回既有 id→stdin 多行 add→get 全文（tags/meta/FSRS 字段）→use good 更新 reps/due/last_review→stats（总数/状态分布/平均 stability）→delete 软删后 list 默认不含、get 显示 trashed+trashed_at→`--json` 错误契约（exit 1/2 + stderr JSON + hint）。
