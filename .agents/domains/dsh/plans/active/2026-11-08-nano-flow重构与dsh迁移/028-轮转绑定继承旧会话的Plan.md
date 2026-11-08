---
name: "028-轮转绑定继承旧会话的Plan"
description: "轮转后的自动绑定改为继承轮转前会话的 Plan（与工作区 active Plan 数量无关），无绑定或目录失效时跳过；0.5.34。"
status: completed
related_noted:
  - '017-轮转后自动校验Plan并绑定看板'
  - '018-恢复Plan开头自动校验'
  - '024-访问信号与剪枝验收'
---

# 028-轮转绑定继承旧会话的Plan

## 取证

- 原实现（`index.ts` 的 `autoCheck`）：`listActivePlans(domainsDirectory)`，只有「恰好一个 active Plan」时才给新会话写绑定；seed 第二行写「工作区有 N 个 active Plan，未建立看板绑定」。
- 用户的修正：**轮转后的自动绑定应继承轮转前会话的 Plan，与工作区有几个 active Plan 无关**。
- 绑定表（`$DSH_HOME/toolkit/nano-flow-plan-bindings.json`）按会话记录 `planPath`，轮转前会话的 id 在 `replacement()` 里可得。

## 第 1 轮

#### Q1 — 绑定目标从哪来？

- 问题：唯一 active Plan（原实现）还是轮转前会话的绑定？
- 推荐答案及理由：继承旧会话绑定——与工作区 Plan 数量解耦，新会话延续同一个 Plan 的看板与上下文。
- 修改意见：用户明确「自动绑定轮转前的 active plan，和工作区有几个没有关系」。
- 处理结论：`inheritedPlanDirectory(绑定表, previousSessionId, workspace)` 取旧会话的 `planPath`；`autoCheck` 增加 `previousSessionId`。

#### Q2 — 旧会话没有绑定、或目录已不存在时怎么办？

- 推荐：不绑，seed 说明原因，不猜 Plan。
- 处理结论：目录存在才绑；否则第二行写「轮转前会话没有绑定 Plan，未建立看板绑定；恢复时确认 Plan 后跑一次 `nano_flow_check`」。

#### Q3 — 绑定的 Plan 已归档（reference/archived）还绑吗？

- 推荐：目录存在就绑——看板照常显示该 Plan 的未完成 note，不因生命周期变空。
- 处理结论：只做目录存在性判断，不限制生命周期。

## 交付

- `rotate.ts`：`autoCheck({ sessionId, previousSessionId, workspace })`；手动与自动两条路径都传旧会话 id。
- `index.ts`：读绑定表 → `inheritedPlanDirectory` → `runtime.bindSession`；seed 第二行写明继承的 `planPath` 或未绑定原因。
- `plan-log.ts`：新增 `inheritedPlanDirectory`（纯函数，目录存在性可注入）。
- `system.md`：轮转条款改为「继承轮转前会话的 Plan 绑定（与 active Plan 数量无关）」。
- ADR 008 记录决策与备选。
- 版本 0.5.34，已装入 desktop / web profile。

## 验证

- `vp check`：122 文件格式、94 文件 lint/类型通过。
- `vp test src`：37 文件 / **305 例**通过（新增 `inheritedPlanDirectory` 2 例；轮转用例改为断言 `previousSessionId`）。
- 旧行为依赖 `listActivePlans` 的绑定路径已从 `autoCheck` 移除；`nano_flow_check` 工具自身的「显式 plan / 唯一 active」策略不变（恢复流程）。

## 残留

- 旧会话被删除后，绑定表里的死条目不回收；后续 dream/维护可清理。
- 需要重启宿主后，轮转才会用新逻辑（当前进程载 0.5.33）。
