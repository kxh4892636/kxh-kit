---
name: '004-ready按DAG分组并补并行执行论述'
description: '让 ready 按依赖关系分组输出未完成 notes，并在 prompt 写并行执行与串行写入约束。'
status: completed
reason: ''
related_noted:
  - '003-按评审清单修订prompt.md'
next_step: ''
---

# 004-ready按DAG分组并补并行执行论述

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 目标

- `nano_flow_read` 的 `ready` 给出未完成 notes 的依赖分组列表: 有依赖关系的 note 在同一组, 组内按拓扑顺序(前置在前), 同层按解锁下游数、状态、id 排序.
- prompt.md 补"前置已完成的 note 可并行, 用 subagent"的论述, 并明确 `nano_flow_write` 由主会话串行写.

## 设计

- `dag.ts` 的 `todoGroups(notes)`: 按 blocked_by 边对未完成 notes 做弱连通分量; 已完成的依赖不连边; blocked 留在原组, 同层排后可执行项; 组间按组内最小 id.
- 组内用 Kahn 拓扑排序; 同层可选集合按"解锁的未完成下游数降序 -> 状态 -> id"排序.
- `read.ts` 的 `ready`: Plan 头 + "未完成(N)" + 每组标题与条目(状态、id、标题、摘要、仅未完成依赖) + 下一步.
- prompt.md: do 第 1 步改为从组内取前置已完成的 note; 新增"并行执行"小节: 前置已完成的 note 用 `subagent` 一条 note 一个任务, 主会话串行写 `notes.json`.

## 执行检查点(2026-11-07)

- 首版按依赖层级分组被用户纠正: 分组应为"有依赖关系的 note 在同一组", 不是"可并行的 note 在同一组".
- 已改为弱连通分量 + 组内拓扑排序; `dag.test` 覆盖链、分叉、单点组; `runtime.test` 覆盖 `ready` 输出.
- 验证: 211 测试通过; `vp check` 通过; build 成功.
- 当前 Plan 的 `ready` 只剩 02(无依赖, 单组).
- 已安装: 打包后 `remove` + `add` 到 desktop profile; 安装目录的 `dist/index.mjs` 与 `dist/nano-flow/prompt.md` 均与仓库 dist 同哈希(SHA-256 8309C8E5…、13B2D7D3…); 重启宿主后的新会话使用新 `ready` 与提示词.

## 验收

- `dag.test` 覆盖依赖链分组与拓扑排序; `runtime.test` 覆盖 `ready` 输出.
- prompt.md 有并行执行小节; do 步骤指向前置已完成的 note.
- 测试、构建、`nano_flow_check workspace` 通过.

## 不做

- 不改 `resume` 的恢复包格式.
- 不改 `notes.json` 结构.

## 迁移前的证据
- `pnpm --filter @kxh4892636/dsh-toolkit exec vp test run src`: 25 files / 211 tests 通过（dag 18、runtime 13）
- `pnpm --filter @kxh4892636/dsh-toolkit exec vp check --fix`: 格式、lint、类型通过（77 文件）
- `pnpm --filter @kxh4892636/dsh-toolkit build`: 成功，dist/nano-flow 重新生成
- 新 `ready` 输出: 未完成（2），第 1 组（04 in_progress、02 pending），下一步提示同组可并行
- `prompt.md` 新增 "### 并行执行"，do 第 1 步改为从第 1 组选 note；`skills/do/SKILL.md` 同步
- 分组口径纠正后: `todoGroups` 按 blocked_by 弱连通分量分组, 组内 Kahn 拓扑排序; `dag.test` 覆盖依赖链、分叉与单点组
- 当前 Plan 的 `ready`: 02 与 04 无依赖关系, 分为第 1 组(02)与第 2 组(04); 04 完成后只剩 02
- `pnpm --filter @kxh4892636/dsh-toolkit exec vp test run src`: 25 files / 211 tests 通过
- `vp check --fix` 通过; `pnpm build` 成功
- `prompt.md` 的 do 第 1 步与「并行执行」改为按单条 note 的前置判断可并行, 不再按组判断
