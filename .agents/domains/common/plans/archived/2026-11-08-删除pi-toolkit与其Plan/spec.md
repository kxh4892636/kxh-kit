---
name: '删除pi-toolkit与其Plan'
description: '**A. 仓库包** - `packages/pi-toolkit/`：git 跟踪 96 个文件、约 1.16 MB；`src/{naming,orchestrator,skills,web}`（orchestrator 62 文件）+ `scripts/`；`package.json`（`@kxh4892636/pi-toolkit` 1.0.0，非 private）、`pi-toolkit.example.json`、`README.md`、`tscon…'
status: in_progress
---

# 删除pi-toolkit与其Plan

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。
## 旧 story

我不再维护 pi（pi harness）侧的扩展了，想把工作区里的 `@kxh4892636/pi-toolkit` 连同它在 `.agents` 里留下的域文档与 Plan 一起清掉，避免死代码、陈旧 ADR 与半途 Plan 继续占用注意力。

但删除是不可逆操作，我要在动手前看到**准确清单**：哪些文件、哪些 Plan、哪些本机配置会被删，哪些东西会因此失效（例如引用它路径的 `~/.pi/agent/settings.json`），以及哪些属于「删了也无所谓」的产物。

验收标准：清单逐项经我确认后才执行；删除后工作区仍能通过 `nano_flow_check` 的 `workspace` 与本仓 `vp check`，且没有指向已删除目录的悬空引用。


## 旧 spec

## 待删对象（按层分组，编号供确认）

**A. 仓库包**
- `packages/pi-toolkit/`：git 跟踪 96 个文件、约 1.16 MB；`src/{naming,orchestrator,skills,web}`（orchestrator 62 文件）+ `scripts/`；`package.json`（`@kxh4892636/pi-toolkit` 1.0.0，非 private）、`pi-toolkit.example.json`、`README.md`、`tsconfig.json`、`vite.config.ts`
- 未跟踪产物：`coverage/`（52 文件 2.1 MB）、`node_modules/`（17 项 0.9 MB）
- `pnpm-lock.yaml` 里对应的 importer 条目

**B. 领域知识（pi 域，46 文件 / 706 KB）**
- `.agents/domains/pi/CONTEXT.md`（9.9 KB）、`QUESTIONS.md`（10 KB）
- `.agents/domains/pi/adr/`：0001–0017 共 17 份（含 0004 三插件合并、0005 NanoFlow 迁移、0007 合并为 orchestrator…）
- `.agents/domains/pi/plans/`
  - `active/2026-11-07-pi多plan编排`：47 条 note（45 completed、1 `in_progress` = 57 B 类精简、1 `waiting/review` = 62 侧栏 bug），notes.json 426 KB
  - `reference/` 8 个已完成 Plan：pi-deepseek-web 插件、pi-nested-skill 插件、pi 插件代码分析、pi 会话自动命名、pi 会话命名过滤 skill 调用、DeepSeek 官方搜索接口、NanoFlow 迁移到 pi-toolkit、pi-toolkit 插件合并

**C. 关联域（orchestration，6 文件 / 20 KB）**
- `.agents/domains/orchestration/{CONTEXT.md, QUESTIONS.md, plans/active/2026-11-07-编排期}`；该域的实现就是 pi-toolkit 的 orchestrator，包删掉后无代码承载

**D. 工作区级引用**
- `CONTEXT-MAP.md`：pi、orchestration 两个 Contexts 条目 + "pi → Nano Flow" 与 "Orchestration → 各业务域" 两条 Relationships
- `vite.config.ts`：第 21 行注释提到 `cd packages/pi-toolkit && vp test --run`（纯注释）
- 历史上提到 pi-toolkit 的文档（不改也合法）：`.agents/domains/dsh/plans/archived/*` 三处、`apps/wiki/docs/050-AI/…`、`inbox/skill-template/references/orchestrator.md`（通用模板，非本包专有）

**E. 本机 pi 侧痕迹（工作区外）**
- `~/.pi/agent/settings.json` 的 `packages` 数组指向 `…/kxh-kit/packages/pi-toolkit`（删包后成为悬空路径）
- `~/.pi/agent/pi-toolkit.json`（工具开关 + web 配置 + orchestrator 上限）
- `~/.pi/agent/orchestrator/`：`events.jsonl`、`workers.json`、`interrupted.json`（运行时账本）
- `~/.pi/agent/sessions/`：305 个文件 / 134.8 MB（pi 全部会话记录，非本包专有）
- `~/.pi/agent/extensions/herdr-agent-state.ts`（第三方/自建扩展，与本包无关）
- 未确认：该包是否已发布到 npm（`npm view` 无输出），发布版无法通过删仓库撤回

**F. 遗留现场**
- `.worktrees/note-64/`：与主分支同一 commit（3179578f）、`git status` 干净，含完整副本与 `node_modules`，约 893 MB；分支 `wt/note-64`，pi 编排的 worker 现场残留

## 删除后必须同步

1. `git rm -r`（或删除）A、B、C 后，`CONTEXT-MAP.md` 去掉两条 Contexts 与两条 Relationships；
2. `pnpm install` 刷新 `pnpm-lock.yaml` 与 `node_modules` 链接；
3. `vite.config.ts` 注释里的 pi-toolkit 字样；
4. 本机 `~/.pi` 的配置与运行时（是否清理见 Q3）；
5. 删除后跑 `nano_flow_check workspace` 与 `vp check` 验证无悬空引用。

## 风险

- pi 域 active Plan 有两条未完成 note（57 in_progress、62 waiting/review），删除即丢弃在途上下文。
- orchestration 域 Plan 只有 1 条 pending note，删除影响小于 pi 域。
- `.worktrees/note-64` 干净且与主分支同 commit，但删除不可恢复。

## 当前进度

已执行完毕：三个目录（`packages/pi-toolkit`、`.agents/domains/pi`、`.agents/domains/orchestration`）删除并提交为 `5cacf776`；`CONTEXT-MAP.md` 与 `vite.config.ts` 同步；`pnpm install` 刷新 lock（-102 包）；`~/.pi/agent` 的插件配置与运行时账本清理（备份在 `.temp/pi-backup/`）；`.worktrees/note-64` 与分支 `wt/note-64` 回收（约 893 MB）。验证：`nano_flow_check workspace` 通过、`vp check` 无类型/lint 错误、etf 单独 `tsc` 无输出。当前 note 01 处于 `waiting + needs=review`，等用户验收。

## 恢复入口

1. `nano_flow_read` 的 `resume` → 读 note 01「实施结果」「执行检查点」「待验证」；
2. 用户验收后 `complete`；
3. 未清理项：`~/.pi/agent/{sessions,missions,extensions,npm}`（pi harness 本体，134.8 MB 会话），需要时另开一条。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [001-删除清单定案：pi-toolkit的包、域、关联域与本机痕迹](001-删除清单定案：pi-toolkit的包、域、关联域与本机痕迹.md) | 出删除清单并拷问范围：pi 域、关联域、本机痕迹与删除方式。 | blocked | 等待用户验收：旧 waiting/needs=review | 1. 用户验收后 `complete`。 2. 若之后仍要用 pi：重启 pi 即可（插件列表已空），需要恢复时从 `.temp/pi-backup/` 与 git 历史取回。 3. 可选后续：`~/.pi/agent/sessions`（134.8 MB pi 会话）与 `missions/` 未清理，需要的话另开一条。 | — |
