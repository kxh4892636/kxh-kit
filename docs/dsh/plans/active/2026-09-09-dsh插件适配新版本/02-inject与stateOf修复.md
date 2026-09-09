---
status: pending
blocked_by: []
---

# inject 与 stateOf 修复

## 交付

`dsh-session-manager` 的子会话读取路径在真实宿主上可用：插件经 `ctx.get` 获取可选服务（不再直读未声明的 ctx 属性），`stateOf` 调用顺序与 `dsh-session-projection` 签名一致，且单测能拦住同类回归。

## 范围

- `packages/dsh-session-manager/src/main.ts`：用 `ctx.get("sessions" | "sessionProjections" | "sessionQuery")` 取服务并组装 `HostServices` 普通对象，去掉 `ctx as unknown as HostServices` 强转；`inject` 数组保持 `["tools","sessionController","workspaceRegistry","systemPrompt","agents"]` 不变（不改变插件激活条件）。
- `packages/dsh-session-manager/src/host.ts`：`SessionProjectionsLike.stateOf` 签名改为 `(session, key)`，调用改为 `live.stateOf(session, "subagent")`；live 命中与冷路径回退（`sessionQuery.observeSession`）行为保持。
- `packages/dsh-session-manager/src/main.test.ts`：新增严格假 ctx 用例——直读未声明服务抛 `cannot get property "…" without inject`，`ctx.get` 返回假服务，断言 `apply` 仍注册 9 个工具并写入指引章节。
- `packages/dsh-session-manager/src/host.test.ts`：新增/收紧 `stateOf` 用例，断言实参顺序为 `(session, "subagent")`，并覆盖 live 命中与冷路径回退两种解析结果。
- 不包含：工具参数/输出 schema 变更、profile 重装与重启、真机冒烟（Issue 03）、`packages/dsh-nested-skill` 的代码改动。

## 直接依赖

无（以 spec 与 ADR-0002、ADR-0004 为约束；Issue 01 的声明变更与本 issue 的代码改动互不阻塞）。

## 验收

- [ ] `src/main.ts` 不再出现 `ctx.sessions` / `ctx.sessionProjections` / `ctx.sessionQuery` 直读；三个服务经 `ctx.get` 注入 `HostServices`
- [ ] 严格假 ctx 用例通过：直读未声明服务即抛错、`ctx.get` 提供假服务时 `apply` 注册 9 个工具
- [ ] `host.ts` 以 `stateOf(session, "subagent")` 调用；用例断言实参顺序并覆盖 live 命中（返回 `mode`）与回退（`observeSession` 解析）两条路径
- [ ] 服务缺席时行为与修复前一致：`sessionProjections`/`sessionQuery`/`sessions` 缺失时仍给出可读的 `SESSION_MANAGER_SUBAGENT_UNAVAILABLE` 错误
- [ ] `vp check` 通过；`vp test src` 全绿（nested-skill 37 项不变，session-manager ≥54 项 + 新增用例）

## 上下文

- [spec](spec.md)
- [审阅文件](../../../../../.flow/quest/2026-09-09-dsh插件适配新版本.md)
- [ADR-0002](../../../adr/0002-会话管理能力以模型工具面交付.md)、[ADR-0004](../../../adr/0004-会话初始化上下文以系统消息注入.md)
- 现场证据：`session_read`（带 `parentSessionId`）实测报 `gateway/internal: cannot get property "sessionProjections" without inject`
- 宿主契约：`dsh-session-projection/lib/types/index.d.ts` 的 `stateOf(session, key)`；`dsh-session-query` 的 `observeSession(sessionId, { projectionMode })`
- cordis 契约：`ctx.get(name, strict?)` 为「Read a service from the store without the inject requirement」，服务缺席返回 `undefined`
- 同类教训：[前序 Plan 04](../../reference/2026-09-01-会话上下文注入与默认workspace/04-安装并端到端冒烟.md)

## 下一步

/code-delivery

## 交付记录

（交付完成时填入交付物与验证证据）
