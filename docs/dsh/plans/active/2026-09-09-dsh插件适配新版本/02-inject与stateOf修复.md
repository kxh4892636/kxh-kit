---
status: in_progress
blocked_by: []
---

# inject 与 stateOf 修复

## 交付

`dsh-session-manager` 的子会话读取路径在真实宿主上可用：插件经 `ctx.get` 获取可选服务（不再直读未声明的 ctx 属性），`stateOf` 调用顺序与返回形状都与 `dsh-session-projection` 契约一致（live 读 host state 的 `identity.mode`、冷路径读 view 的 `subagent.mode`），且单测能拦住同类回归。

## 范围

- `packages/dsh-session-manager/src/main.ts`：用 `ctx.get("sessions" | "sessionProjections" | "sessionQuery")` 取服务并组装 `HostServices` 普通对象，去掉 `ctx as unknown as HostServices` 强转；`inject` 数组保持 `["tools","sessionController","workspaceRegistry","systemPrompt","agents"]` 不变（不改变插件激活条件）。
- `packages/dsh-session-manager/src/host.ts`：`SessionProjectionsLike.stateOf` 签名改为 `(session, key)`、返回该 unit 的 host state `{ identity?: { mode } }`；调用改为 `live.stateOf(session, "subagent")` 并用 `subagentModeOfState` 解析；冷路径 `sessionQuery.observeSession` 用 `subagentModeOfSnapshotValues` 从 `ProjectionSnapshot.values.subagent.mode` 解析。
- `packages/dsh-session-manager/src/main.test.ts`：严格假 ctx 用例（`injected` 由导出的 `inject` 派生）——直读未声明服务抛 `cannot get property "…" without inject`、`ctx.get` 返回假服务，覆盖 live 命中、冷查询回退、单路缺席与全部缺席四种装配。
- `packages/dsh-session-manager/src/host.test.ts`：`stateOf` 实参顺序用例 + 两种真实投影形状的解析用例 + 冷路径回退用例。
- `packages/dsh-session-manager/src/test-support.ts`：严格假 ctx（`makeStrictCtx`）与按宿主真实形状返回的假投影服务。
- 不包含：工具参数/输出 schema 变更、profile 重装与重启、真机冒烟（Issue 03）、`packages/dsh-nested-skill` 的代码改动。

## 直接依赖

无（以 spec 与 ADR-0002、ADR-0004 为约束；Issue 01 的声明变更与本 issue 的代码改动互不阻塞）。

## 验收

- [x] `src/main.ts` 不再出现 `ctx.sessions` / `ctx.sessionProjections` / `ctx.sessionQuery` 直读；三个服务经 `ctx.get` 注入 `HostServices`
- [x] 严格假 ctx 用例通过：直读未声明服务即抛错、`ctx.get` 提供假服务时 `apply` 注册 9 个工具；`inject` 少声明一项时用例失败
- [x] `host.ts` 以 `stateOf(session, "subagent")` 调用；用例断言实参顺序并覆盖 live 命中（host state 的 `identity.mode`）与回退（`observeSession` 的 `values.subagent.mode`）两条路径
- [x] 解析函数按宿主真实形状读取：`{ identity: { mode } }` 与 `{ subagent: { mode } }` 命中，旧假设形状（`values.subagent.identity.mode`）返回 `undefined`
- [x] 服务缺席时行为与修复前一致：`sessionProjections`/`sessionQuery`/`sessions` 缺失时仍给出可读的 `SESSION_MANAGER_SUBAGENT_UNAVAILABLE` 错误
- [x] `vp check` 通过；`vp test src` 全绿（nested-skill 37 项不变，session-manager 62 项）

## 上下文

- [spec](spec.md)
- [审阅文件](../../../../../.flow/quest/2026-09-09-dsh插件适配新版本.md)
- [ADR-0002](../../../adr/0002-会话管理能力以模型工具面交付.md)、[ADR-0004](../../../adr/0004-会话初始化上下文以系统消息注入.md)
- 现场证据：`session_read`（带 `parentSessionId`）实测报 `gateway/internal: cannot get property "sessionProjections" without inject`
- 宿主契约：`dsh-session-projection/lib/types/index.d.ts` 的 `stateOf(session, key)` 返回 `SessionProjectionStateMap[key]`（subagent = `{ identity?: { mode } }`）与 `ProjectionSnapshot.values`（subagent = `{ mode, label?, seq } | null`）；`dsh-session-query` 的 `observeSession(sessionId, { projectionMode })` 返回 `projections: ProjectionSnapshot`；本机 0.1.2-rc.1 的 `subagentIdentityProjectionDefinition`（`stateSchema` / `wire.view`）实测两种形状
- cordis 契约：`ctx.get(name, strict?)` 为「Read a service from the store without the inject requirement」，服务缺席返回 `undefined`
- 同类教训：[前序 Plan 04](../../reference/2026-09-01-会话上下文注入与默认workspace/04-安装并端到端冒烟.md)

## 下一步

/code-delivery

## 交付记录

- **交付物**：`src/main.ts`（`hostServicesOf` 经 `ctx.get` 组装 `HostServices`，`inject` 不变）、`src/host.ts`（`SessionProjectionsLike.stateOf(session, key)` 返回 host state；`subagentModeOfState` / `subagentModeOfSnapshotValues` 按宿主真实形状解析；`SubagentMode` 别名）、`src/main.test.ts`（严格假 ctx 四装配用例）、`src/host.test.ts`（实参顺序 + 两种形状 + 冷回退）、`src/test-support.ts`（`makeStrictCtx` 与真实形状假服务）。提交 `bc778017`。
- **验证证据**：
  - `npx vp check`（包内与仓库根）均 pass（仓库根 0 errors / 16 warnings，warning 全在 diff 外）；`vp test src`：session-manager 62 项、nested-skill 37 项全绿；`vp test --run --coverage`：98.84/92.56/98.66/99.57（阈值 80）。
  - 宿主契约实测（`.temp/verify-projection-shape.mjs`，不入库）：导入本机 0.1.2-rc.1 的 `subagentIdentityProjectionDefinition`，`stateSchema.parse({identity:{mode,label,seq}})` 与 `viewSchema.parse(wire.view(state))` 通过；`subagentModeOfState(state)` → `continuable`、`subagentModeOfSnapshotValues({subagent:view})` → `continuable`；两种旧假设形状均 `undefined`；`null` 哨兵 → `undefined`。
  - 变异电池（每项改后还原，8/8 被拦）：A 整体透传 ctx → 4 项失败；B `stateOf` 实参反向 → 2；C 不装配 `sessionQuery` → 1；D 不装配 `sessionProjections` → 1；E `inject` 漏 `workspaceRegistry` → 6；F 漏 `tools` → 6；G1 live 形状退回旧假设 → 3；G2 冷路径形状退回旧假设 → 4。
  - 双轴审查 5 轮收敛：Standards 最终仅余 2 项已接受的 judgement（`subagentModeOfState` 入参 `unknown` 与冷路径 `values` 声明形状的取舍；测试夹具重复），无 blocker/major；Spec 轴 R3 的 blocker（投影形状）已按真实宿主契约修复并由独立复现确认。
  - 未覆盖：真实宿主的 `session_read` 子会话读取（需重装 profile + 重启，Issue 03）。
