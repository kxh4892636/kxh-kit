---
name: '001-删除清单定案：pi-toolkit的包、域、关联域与本机痕迹'
description: '出删除清单并拷问范围：pi 域、关联域、本机痕迹与删除方式。'
status: blocked
reason: '等待用户验收：旧 waiting/needs=review'
related_noted: []
next_step: '1. 用户验收后 `complete`。 2. 若之后仍要用 pi：重启 pi 即可（插件列表已空），需要恢复时从 `.temp/pi-backup/` 与 git 历史取回。 3. 可选后续：`~/.pi/agent/sessions`（134.8 MB pi 会话）与 `missions/` 未清理，需要的话另开一条。'
---

# 001-删除清单定案：pi-toolkit的包、域、关联域与本机痕迹

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。
## 用户输入

「删除 pi-toolkit 及其相关的 plan，想确定删除那些。」→ 出准确清单，确认后执行。

## 定案（第 1 轮）

用户答「删除和 pi-toolkit 相关的内容」，并把连带项全选。

1. **仓库包**：删 `packages/pi-toolkit/`（96 跟踪文件 / 1.16 MB）+ 未跟踪的 `coverage/`、`node_modules/`。
2. **pi 域**：整域删除 `.agents/domains/pi/`（46 文件 / 706 KB：CONTEXT、QUESTIONS、ADR 0001–0017、active 1 个 Plan、reference 8 个 Plan）。
3. **orchestration 域**：整域删除（6 文件 / 20 KB，实现即 pi-toolkit 的 orchestrator）。
4. **CONTEXT-MAP.md**：删 pi / orchestration 两条 Contexts 与两条 Relationships；`vite.config.ts` 注释去掉 pi-toolkit 字样。
5. **本机痕迹**：`~/.pi/agent/settings.json` 的 `packages` 清空；删 `~/.pi/agent/pi-toolkit.json`、`~/.pi/agent/orchestrator/`。
6. **遗留现场**：删 `.worktrees/note-64`（893 MB，clean、同 commit）与分支 `wt/note-64`。
7. **方式**：`git rm` 后单独 commit。

**保留**：`~/.pi/agent/{sessions,missions,extensions,npm}`（pi harness 本体）、`inbox/skill-template/references/orchestrator.md`（通用模板）、`apps/wiki` 泛提 orchestrator 的文档、dsh 域已归档 Plan 里对 pi-toolkit 的历史提及。

## 取证摘要

详细清单见 `spec.md`「待删对象」；关键事实：pi 域 active Plan 有 2 条未完成 note（57 `in_progress`、62 `waiting/review`），orchestration 域 1 条 pending，删除即丢在途上下文；`~/.pi/agent/settings.json` 直指仓库路径；`npm view @kxh4892636/pi-toolkit` 无输出，发布版无法撤回。

## 拷问记录（第 1 轮，已收敛）

| Q | 结论 |
|---|---|
| Q1 pi 域 | 与 pi-toolkit 相关的内容全删 → 整域删除 |
| Q2 连带项 | orchestration 域、CONTEXT-MAP 条目、`~/.pi` 配置与运行时账本、`.worktrees/note-64`、包内未跟踪产物，全选 |
| Q3 方式 | `git rm` 后单独 commit |

## 实施结果

- `git rm -r` 三个目录；`pnpm install` 后 lock 删 1015 行、`Packages: -102`，lock 里已无 pi-toolkit。
- `CONTEXT-MAP.md` 只剩 etf / common / nano-flow / dsh / music / video 六个域与两条 Relationships；`vite.config.ts` 注释去掉 pi-toolkit。
- `git worktree remove --force .worktrees/note-64` + `git branch -D wt/note-64`：回收约 893 MB，worktree 列表只剩主工作区。
- `~/.pi/agent/settings.json` 的 `packages` 置空；删 `pi-toolkit.json` 与 `orchestrator/`；原文件已备份到 `.temp/pi-backup/`。
- 工作区仅剩 dsh 域 5 个**已归档** Plan 文件里对 pi-toolkit 的历史提及（不改）。
- 提交：删除项 + `CONTEXT-MAP.md` + `vite.config.ts` + `pnpm-lock.yaml` + 本 Plan，单独一个 commit；dsh-toolkit 状态机那批未提交改动不混入。

## 执行检查点

删除与引用同步全部完成，`nano_flow_check workspace` 与 `vp check` 通过；等用户验收。

## 待验证

1. `nano_flow_check workspace` → 工作区校验通过。
2. `pnpm exec vp check` → 全部文件格式通过、379 文件无类型/lint 错误。
3. `pnpm exec tsc -p apps/etf/tsconfig.json --noEmit` → 无输出（排除删除导致的类型回归）。
4. `~/.pi/agent` 目录下已无 `pi-toolkit.json` 与 `orchestrator/`；`settings.json` 的 `packages` 为 `[]`。

## 下一步

1. 用户验收后 `complete`。
2. 若之后仍要用 pi：重启 pi 即可（插件列表已空），需要恢复时从 `.temp/pi-backup/` 与 git 历史取回。
3. 可选后续：`~/.pi/agent/sessions`（134.8 MB pi 会话）与 `missions/` 未清理，需要的话另开一条。

