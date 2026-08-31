---
status: completed
---

# 会话上下文注入与默认 workspace

## 问题

已交付的 `session_spawn` 语义与用户确认的行为不一致：① 未给 workspaceId/cwd 时新会话落在 Host 回退 cwd（仅碰巧与调用方目录一致），应默认与**调用方会话同一 workspace**；② 无上下文注入能力——创建时注入的上下文应作为**系统消息**注入（不触发模型调用），首调用由第一条用户消息驱动（ADR-0004）。

## 方案

在现有 `packages/dsh-session-manager` 上做增量：

- **prefactoring（Make the change easy）**：把 spawn 的 workspace 解析抽为独立逻辑（`resolveSpawnLocation`），spawn 调用点与上下文注入留 seam，行为不变（现有 40 项单测锁定）。
- **默认 workspace 规则**：spawn 未给 workspaceId/cwd 时，取工具执行上下文的调用方会话（`exec.agent.session`）→ 其 cwd/workspace 作为默认传给 `create`。
- **会话上下文注入**：新建 `src/session-context.ts`；`create` 后经 `ctx.agents.get(sessionId)` 或 `session/created` 事件取得 Agent，在 `agent.ctx.systemPrompt.section({ name, order, text })` 注册（会话作用域 prompt 段，ADR-0004 机制）。`session_spawn` 增加 `context` 参数。

## 已排除的备选

- **用户消息 seed**：创建即投递用户消息会触发一次真实模型调用，上下文与用户消息同面混存；被拒（ADR-0004 Considered Options）。
- **为每次注入生成临时 agent preset**：写入用户 `.agent-presets/` 有状态且污染预设空间；被拒。

## 实施决策

- **01 prefactoring**：`host.ts` 拆出 `resolveSpawnLocation(options, callerCwd?)` 并返回 `{ workspaceId?, cwd? }` 决策；spawn 签名增加可选的调用方上下文，注入点留 async 钩子（默认空实现）；行为不变。
- **02 默认 workspace**：`tools.ts` 的 `session_spawn.execute` 读 `exec.agent?.session`（header.cwd）；`host.spawn` 经 resolveSpawnLocation 以调用方 cwd 兜底；单测覆盖「未给参数 → 落在调用方 workspace」与「显式给出 → 覆盖」。
- **03 context 注入**：`src/session-context.ts` 导出 `installSessionContext(ctx, sessionId, text): Promise<void>`——订阅/轮询 Agent 就绪后 `agent.ctx.systemPrompt.section({ name: 'session-manager:context', order: 2850, text })`；幂等（同一 session 不重复注册）；竞态处理（Agent 未就绪时先等 `session/created`）。`session_spawn` 增加 `context` 参数；单测覆盖注册参数、幂等、未就绪等待。
- 模块命名与排位：`session-context`(kebab)；section name `session-manager:context`、order 2850(与工具指引同段区)。
- 测试：vitest 同目录单测；覆盖阈值 ≥80%；`vp check`/`vp pack`；行为不变部分由既有 40 项测试守护。
- 交付形态：修改后 `vp pack` 重建 dist，**同步 dist 到 profile 快照**后重启（经验：`dsh plugin add` 是快照复制）。
- 执行方式（基线卡确认后变更）：01 直接实现；02 与 03 各在独立 worktree 分支并行实现（分支 `worktree/dsh-session-workspace-*`、`worktree/dsh-session-context-*`）；02/03 完成后依次 `--no-ff` 合回 main（--no-ff），再执行 04；**到需要用户手动重启时停止任务**，等待手动重启后继续冒烟；最终 commit & push 到 origin。

## 工作环境

同既有 plan（DSH 安装/参考仓库/web profile/工作区工具链）；实现完成后需重启 web 进程验证。

## 范围

- spawn 默认 workspace 行为修正 + 单测。
- `session_spawn.context` 系统消息注入 + 单测。
- 安装/重启/冒烟（含"注入不触发调用、首调用由用户消息驱动"验证）。

## 非范围

- 预置指令/agentPreset 形态选择（维持 ADR-0002 语义与既有决策）。
- CLI/HTTP 面、硬删除等（沿用既有非范围）。
- 上游 DSH 改动。

## 待定

无。

## 上下文

- [quest 审阅](../../../../.flow/quest/2026-09-01-会话上下文注入与默认workspace.md)
- [ADR-0004](../../adr/0004-会话初始化上下文以系统消息注入.md)
- [CONTEXT 术语：预置指令/会话上下文注入](../../CONTEXT.md)
- 既有实现：`packages/dsh-session-manager`（`src/tools.ts` session_spawn、`src/host.ts` spawn、`src/session-context.ts` 待建）
- 参考 plan：`docs/dsh/plans/reference/2026-09-01-session与model管理插件`

## Issue

| #   | Issue | 状态 | 阻塞于 | 下一步 |
| --- | --- | --- | --- | --- |
| 01 | [spawn 重构抽 seam(prefactoring)](01-spawn重构抽seam.md) | completed | — | /code-delivery |
| 02 | [spawn 默认 workspace = 调用方会话](02-spawn默认workspace.md) | completed | 01 | /code-delivery |
| 03 | [会话上下文系统消息注入](03-会话上下文系统消息注入.md) | completed | 01 | /code-delivery |
| 04 | [安装并端到端冒烟](04-安装并端到端冒烟.md) | completed | 02, 03 | /code-delivery |
