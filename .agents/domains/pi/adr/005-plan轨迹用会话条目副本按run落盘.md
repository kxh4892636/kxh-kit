---
name: '005-plan轨迹用会话条目副本按run落盘'
description: '每个 Plan 目录下写 `<plan>/log.jsonl`：每个 run 一行、entries 是 pi 会话条目原样副本，run 结束写一次；gitignore 排除，不进版本库。'
status: 'accepted'
---

# Plan 轨迹用会话条目副本按 run 落盘

## 背景

dsh 的 Plan 目录下有 `log.jsonl`：每轮一条 compact 记录（user / assistant / 工具名与参数摘要，配 4 KB / 8 KB 截断），带 `seq` 供 dream 游标做增量。

pi 侧的会话 JSONL 已经是完整轨迹，但它在 `~/.pi/agent/sessions/--<encoded-cwd>--/` 下、按 cwd 而非 Plan 组织。要在 Plan 目录里看到「这个 Plan 发生过什么」，需要一层归属或一层副本。

## 决策

- 在 `<plan>/log.jsonl` 写轨迹，**每个 run 一行**：`{ type: "run", v: 1, sessionId, sessionFile, cwd, planPath, run, startedAt, endedAt, entries }`。
- `entries` 是本次 run 新增的 pi 会话条目**原样副本**（保留 `id` / `timestamp` / `message`），不另造 compact 摘要、不做截断。
- 写入时机：`agent_start` 记叶子条目 id，`agent_end` 切出新增条目并追加一行；不做逐条实时写。
- 同一文件的追加串行化，`run` 序号按已有行数递增，坏行跳过。
- 文件落在 plan 目录但被 `.gitignore` 的 `**/plans/**/log.jsonl` 排除，只留在本机。
- 只写增量：`agent_start` 记叶子条目，`agent_end` 只取之后的条目；功能上线前的历史不自动补，需要时用一次性 `type: "backfill"` 段记录手动回填（2026-11-09 本 Plan 已回填 10 段 / 395 条目）。

## 已排除的备选

- **照搬 dsh 的 compact 记录（4 KB / 8 KB 截断 + `seq`）**：pi 已经有权威会话文件，再压缩一次等于丢掉原始参数与结果；`seq` 也没有消费方（dream 不用游标）。
- **只在 plan 下存索引（sessionId + 路径 + 轮次时间）**：读起来要来回跳文件，且依赖会话文件不被清理；收益小于成本。
- **不落盘、直接用会话文件**：无法脱离 cwd 编码与绑定关系定位「这个 Plan 的轨迹」。
- **把 `log.jsonl` 提交进 git**：会话条目可能含密钥、体积远超文档；保持 gitignore。

## 已知取舍

- 体积：条目原样复制，plan 目录与源会话各存一份；真机两轮实测单行 41 KB / 16 KB，其中 80–95% 是每轮重复的 `message/system` 提示词补丁。2026-11-09 讨论过丢弃 system 条目，用户选择**全保留**（轨迹保真优先于体积）。
- 崩溃窗口：run 中途被强杀时本次 run 不落盘，源会话仍完整。
- 老 Plan 没有该文件，dream 对它们退回读 `spec.md` 与 `notes_index.md`。

## 相关

- [014-Plan轨迹落盘](../plans/reference/2026-11-09-pi-toolkit插件/014-Plan轨迹落盘.md) — 实现、测试与验收步骤。
- [004-dream由命令手动触发且不依赖seq游标](004-dream由命令手动触发且不依赖seq游标.md) — dream 以此为轨迹输入，因此不需要会话归属索引。
