---
name: '004-dream由命令手动触发且不依赖seq游标'
description: 'dream 由 /dream 手动触发，不建定时任务、不用 seq 游标；输入是 plan 目录的轨迹副本与 spec/note，GUIDE.md 归 dream 维护。'
status: 'accepted'
---

# dream 由命令手动触发且不依赖 seq 游标

## 背景

dsh 的 dream 是「宿主 Schedule 每天 08:00 把 `prompts/dream.md` 投给新建会话」，输入四层里 L0 是 `<plan>/log.jsonl`（每轮 compact turn，带 `seq`），游标 `$DSH_HOME/toolkit/nano-flow-dream.json` 按 `seq` 增量，保证「至少一次投递」幂等。

pi 侧的现实：没有 Schedule 接缝；也没有内置 subagent。移植 dream 时必须重新决定触发、输入与幂等。Plan 目录下的轨迹文件是后加的（ADR 005），形态已换成 pi 会话条目副本而不是 dsh 的 compact 摘要。

## 决策

- **触发**：只暴露 `/dream` 命令，手动执行一次；不做定时、不做后台环。
- **输入**：读 `<plan>/log.jsonl`（ADR 005，run 级 pi 条目副本）与 `spec.md` / `notes_index.md`；不扫会话目录、不建会话归属索引。没有轨迹的老 Plan 退回只读 spec 与 note。
- **范围**：当前 cwd 的 `.agents/domains/*`；每域在 `active` + `reference` 里按目录名日期倒序取最新 `dreamMaxPlansPerDomain`（默认 21）个 Plan，`archived` 不参与。
- **幂等**：不留游标，每次全量；幂等靠「检查现有文档再决定是否写」与人工重跑验收（无新结论时报告无改动）。
- **收尾**：dream 自己跑 `nano_flow_check` 并 `git commit`（`docs(dream): …`）；工作区不干净时拒绝运行。
- **GUIDE**：`GUIDE.md` 正文改由 dream 维护，日常循环与 `nano_flow_create` 仍不得改。

## 已排除的备选

- **移植 Schedule 定时投递**：pi 没有宿主调度接缝，只能自带定时器，而 pi 的进程生命周期不保证后台常驻。
- **补写 `<plan>/log.jsonl` 与 `seq` 游标**：与当时「不写 log」的决定冲突，且要新增 `turn_end` 写盘与截断逻辑。（2026-11-09 后续：`<plan>/log.jsonl` 已按用户要求实现为 pi 条目副本，见 ADR 005；但 dream 仍不用 `seq` 游标，所以本条排除的只是游标机制。）
- **扫 `~/.pi/agent/sessions` 找绑定当 L0**：241 MB / 291 个文件，且子串匹配会把 `custom_message` 与消息正文当成绑定（实测一个会话里真绑定 1 条、噪音 100 条）；改为读 Plan 目录下的轨迹副本。
- **用 git 提交当游标**：仓库里尚无 `docs(dream):` 历史，首次必然全量；再叠一层游标只增加失败模式。
- **多域并行**：pi 没有内置 subagent，移植示例扩展要 spawn 独立进程，收益不足以抵掉复杂度。
- **GUIDE 仅由用户维护**：晋升 pass 就没有写出口，五 pass 退化成四 pass。

## 约束

> 纠正（2026-11-09，[014-Plan轨迹落盘](../plans/active/2026-11-09-pi-toolkit插件/014-Plan轨迹落盘.md)）：原约束写「会话里的 `planPath` 失配时只报告未归属」，那是「扫会话找绑定」方案的说法；该方案已随 ADR 005 取消，dream 只读 Plan 目录下的 `log.jsonl`，不再有会话归属与未归属计数。下面这条 `SessionManager.list()` 的代价保留为当时排除该方案的依据。

- 不能用 `SessionManager.list()`：它为算 `firstMessage` / `allMessagesText` 会逐行 `JSON.parse` 每个会话，代价与文件总量成正比；也不能用子串匹配绑定——`custom_message` 条目与消息正文里都会出现 `nano-flow` 字样（实测一个会话 1 条真绑定、6 条 `custom_message`、100 条正文命中）。
- 模型读轨迹必须走 `bash` + `python3` / `grep -o`：`read` 工具 2000 行 / 50 KB 上限会截断单行（实测单行最长 405 KB），本机无 `jq`。
- 全量范围是「21 个 Plan × 域数」，成本控制靠 dream.md 要求「先读 spec 与 notes_index，再挑轨迹」。

## 相关

- [013-dream手动维护命令](../plans/active/2026-11-09-pi-toolkit插件/013-dream手动维护命令.md) — 本决策的实现路径、测试与验收步骤。
- [003-模式与绑定存会话条目](003-模式与绑定存会话条目.md) — Plan 归属的会话映射正是由这些绑定条目建立的。
