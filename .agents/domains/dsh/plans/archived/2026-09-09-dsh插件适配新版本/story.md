# dsh插件适配新版本

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh插件适配新版本

`packages/dsh-nested-skill` 与 `packages/dsh-session-manager` 是按 DSH `0.1.2-alpha.2` 写的插件，宿主已升到 `latest` 发布通道的 `0.1.2-rc.1`。逐包比对 10 个相关上游包的 `lib/types/*.d.ts` 后确认：alpha.2 → rc.1 **没有破坏性 API 变更**（差异仅为 branded 类型、`seedLength` → `isSeeded` + `inheritedEventCount` 改名、`SessionHeader` → `SessionWireHeader`、文档措辞），两个插件在 rc.1 上仍能加载并工作（本会话工具目录含 9 个自有 `session_*` 与 5 个上游搜索工具；任意深度 skill 发现生效）。

真正需要处理的是三件事：

1. **声明漂移**：两个包 peer 仍是 `^0.1.2-alpha.2`；`dsh-session-manager` 把上游 opt-in 工具包精确钉在 `0.1.2-alpha.2`，profile 因此混装 alpha.2 工具包（`dsh-tool-session-query`、`dsh-brand`）与 rc.1 宿主。
2. **子会话读取失败（既有缺陷）**：`packages/dsh-session-manager/src/host.ts` 经 `HostServices` 直读 `ctx.sessions` / `ctx.sessionProjections` / `ctx.sessionQuery`，而 `src/main.ts` 的 `inject` 未声明它们；真实宿主报 `gateway/internal: cannot get property "sessionProjections" without inject`（本次实测）。
3. **`stateOf` 参数顺序反了（既有缺陷）**：`host.ts` 调 `live.stateOf("subagent", session)`，`dsh-session-projection` 的签名是 `stateOf(session, key)`（alpha.2 与 rc.1 相同）；实现按 `key` 查注册表，传入 Session 对象时命中不到，静默返回 `undefined`。
4. **投影形状假设错误（既有缺陷）**：`subagentModeOf` 读 `values["subagent"]["identity"]["mode"]`，而宿主 `stateOf(session, "subagent")` 返回该 unit 的 host state（`{ identity?: { mode } }`，无 `values` 层），`ProjectionSnapshot.values.subagent` 是 wire view（`{ mode, label?, seq } | null`，无 `identity` 层）——两条路径都解析不出 mode，子会话 `session_read` 在真实宿主上必然报 `SESSION_MANAGER_SUBAGENT_UNAVAILABLE`（本机 0.1.2-rc.1 的真实投影定义实测：`stateSchema.parse` / `wire.view` 两种形状均不接受旧假设）。

约束：只保证 `latest` 发布通道（当前 `0.1.2-rc.1`）正确；不引入新领域术语、不新增 ADR；生效需要重启 3080 实例，会中断当时正在执行的会话。
