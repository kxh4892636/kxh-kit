---
status: in_progress
---

# dsh 插件适配新版本

## 问题

`packages/dsh-nested-skill` 与 `packages/dsh-session-manager` 是按 DSH `0.1.2-alpha.2` 写的插件，宿主已升到 `latest` 发布通道的 `0.1.2-rc.1`。逐包比对 10 个相关上游包的 `lib/types/*.d.ts` 后确认：alpha.2 → rc.1 **没有破坏性 API 变更**（差异仅为 branded 类型、`seedLength` → `isSeeded` + `inheritedEventCount` 改名、`SessionHeader` → `SessionWireHeader`、文档措辞），两个插件在 rc.1 上仍能加载并工作（本会话工具目录含 9 个自有 `session_*` 与 5 个上游搜索工具；任意深度 skill 发现生效）。

真正需要处理的是三件事：

1. **声明漂移**：两个包 peer 仍是 `^0.1.2-alpha.2`；`dsh-session-manager` 把上游 opt-in 工具包精确钉在 `0.1.2-alpha.2`，profile 因此混装 alpha.2 工具包（`dsh-tool-session-query`、`dsh-brand`）与 rc.1 宿主。
2. **子会话读取失败（既有缺陷）**：`packages/dsh-session-manager/src/host.ts` 经 `HostServices` 直读 `ctx.sessions` / `ctx.sessionProjections` / `ctx.sessionQuery`，而 `src/main.ts` 的 `inject` 未声明它们；真实宿主报 `gateway/internal: cannot get property "sessionProjections" without inject`（本次实测）。
3. **`stateOf` 参数顺序反了（既有缺陷）**：`host.ts` 调 `live.stateOf("subagent", session)`，`dsh-session-projection` 的签名是 `stateOf(session, key)`（alpha.2 与 rc.1 相同）；实现按 `key` 查注册表，传入 Session 对象时命中不到，静默返回 `undefined`。
4. **投影形状假设错误（既有缺陷）**：`subagentModeOf` 读 `values["subagent"]["identity"]["mode"]`，而宿主 `stateOf(session, "subagent")` 返回该 unit 的 host state（`{ identity?: { mode } }`，无 `values` 层），`ProjectionSnapshot.values.subagent` 是 wire view（`{ mode, label?, seq } | null`，无 `identity` 层）——两条路径都解析不出 mode，子会话 `session_read` 在真实宿主上必然报 `SESSION_MANAGER_SUBAGENT_UNAVAILABLE`（本机 0.1.2-rc.1 的真实投影定义实测：`stateSchema.parse` / `wire.view` 两种形状均不接受旧假设）。

约束：只保证 `latest` 发布通道（当前 `0.1.2-rc.1`）正确；不引入新领域术语、不新增 ADR；生效需要重启 3080 实例，会中断当时正在执行的会话。

## 方案

- **版本基线迁到 rc.1**：两个包的 DSH 相关 peer 与上游 opt-in 工具包依赖统一为 `^0.1.2-rc.1`（`@deepseek-ai/cordis`、`@deepseek-ai/schemastery` 保持各自范围）；工具包保留在 `dependencies`（ADR-0003：上游 opt-in、宿主默认不挂载，`dsh plugin add` 需自动装入）。
- **服务获取改用 `ctx.get(name)`**：cordis 明示该 API 可「read a service from the store without the inject requirement」；`main.ts` 取服务并组装 `HostServices`，`inject` 与插件激活条件不变，服务缺席时沿用 `host.ts` 既有降级分支。
- **修正 `stateOf` 调用与投影形状**：live 路径按 `stateOf(session, "subagent")` 读 host state 的 `identity.mode`，冷路径读 `ProjectionSnapshot.values.subagent.mode`（view 形状）。
- **用严格假 ctx 把 inject 规则变成可拦截的单测**：直读未声明服务即抛错、`ctx.get` 返回假服务，`apply` 仍须注册 9 个工具。
- **交付末段重装并重启**：`vp pack` 重建 dist → 重装 web profile 快照 → 重启 3080 → 真机冒烟（含零成本的已存在子会话读取）。

## 已排除的备选

- **同时兼容 `alpha` 发布通道**（保留 chunk 行展开并适配 `0.1.5-alpha.1` 的 wire 形态）：`alpha` 通道当前无使用者，会引入只在 `alpha` 生效的分支与测试面；`chunkEventOf` 在 `latest` 通道上仍是必需代码，保留不删。
- **把三个服务加入 `inject`**（与上游 `dsh-tool-session-query` 的写法一致）：会让插件在缺少索引引擎的 profile 上整体不加载，9 个工具全部消失。
- **上游工具包移入 `peerDependencies`**：`dsh plugin add` 不再自动装入 opt-in 工具，违反 ADR-0003 的交付形态。
- **另建隔离 profile + 独立端口冒烟**：缺少既有会话与子会话样本，无法验证子会话读取，且工作量翻倍。
- **只做静态比对、不重启验证**：`inject` 与 `stateOf` 缺陷只在真实 cordis 宿主暴露（前序 Plan 已两次记录同类教训：`agents` 曾因同一原因导致启动失败）。
- **bump 版本号并产出 tarball**：安装方式是 `file:` 快照，没有消费者读取版本号，bump 不产生可验证价值。

## 实施决策

- **版本范围**：`^0.1.2-rc.1` 对齐 `latest` 发布通道当前版本（`0.1.2` 序列，含 `0.1.2-*` 预发布与 `0.1.2` 稳定版）；该范围同样会接受后续 `0.1.x` 稳定版，因此 `latest` 跳版后需人工复核并对齐，不能假设范围会自动收紧（沿用 ADR-0003 的「升版需显式决策」口径）。
- **服务面边界**：`HostServices` 的 `sessions` / `sessionProjections` / `sessionQuery` 三个字段保持可选（`sessionController` / `workspaceRegistry` 仍为必填）；`main.ts` 负责取服务并组装普通对象，`host.ts` 保持纯逻辑与假服务可测，不在 host 层接触 cordis。
- **inject 规则**：`apply` 内访问 ctx 服务只有两条合法路径——写入 `inject` 数组，或经 `ctx.get` 读取；单测以严格假 ctx 强制。
- **投影形状契约**：`SessionProjectionsLike.stateOf(session, "subagent")` 返回该 unit 的 host state `{ identity?: { mode } }`（与 `dsh-session-projection` 的 `stateOf` 返回类型一致）；冷路径从 `ProjectionSnapshot.values.subagent.mode` 读取（wire view 形状，无 `identity` 层，`null` 表示描述符无效）。
- **生效路径**：`vp pack` 重建 dist → `dsh plugin --profile web add file:<包路径>` 重装快照（`file:` 是快照复制，不自动跟随源码）→ 重启 3080 实例 → 会话内冒烟。
- **文档口径**：README 写明兼容 DSH `0.1.2-rc.1`（`latest` 发布通道）；ADR-0003 中的版本字面量同步为发布通道表述，决策本身不变。

## 工作环境

- 宿主：`dsh-alive` 受管的 3080 实例，当前 `0.1.2-rc.1`（tag `latest`）；状态见 `%LOCALAPPDATA%\dsh-keep-alive\3080\{state.json,control.json,dsh.log}`。
- profile：`~/.dsh/profiles/web`，bundles 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 与两个自研插件；插件以 `file:` 依赖快照复制安装。
- 工具链：`vp pack` / `vp check` / `vp test src`（vitest）；Node ≥ 22.12。
- 单测基线：nested-skill 37 项、session-manager 54 项全绿（本轮实测）。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`。

## 范围

- 两个包的 DSH 相关 peer/依赖声明对齐 `^0.1.2-rc.1`；README 补兼容版本说明；ADR-0003 的版本字面量同步（决策不变）。
- 修复 `inject` 缺陷（改用 `ctx.get` 组装服务）、`stateOf` 参数顺序缺陷与投影形状缺陷（live 读 host state、冷路径读 view），并补可拦截同类回归的用例。
- 重建 dist、重装 web profile 快照、重启 3080，并做真机冒烟（含子会话读取）。

## 非范围

- `0.1.5-alpha.1`（`alpha` 发布通道）的 chunk 行移除适配；`chunkEventOf` 在 `latest` 通道上保留不删。
- 插件功能扩展、工具参数/输出 schema 变更、GUI 与上游改动、npm 发布、版本号 bump。
- 其他包（`dsh-keep-alive`、`nano-flow`、`nano-mem` 等）的版本策略。

## 待定

- **`alpha` 发布通道兼容**：`@deepseek-ai/dsh-session/chunk-rows` 子路径与 `SessionHistoryRecord` 的 `chunks` 变体在 `0.1.5-alpha.1` 已移除（本轮比对证据），届时 `host.ts` 的 chunk 行展开失效。恢复条件：用户决定跟随 `alpha` 发布通道，或 `latest` 通道跳到含该变更的版本时另起 Plan 处理。
- **`latest` 跳版策略**：本轮把 peer 对齐到 `0.1.2` 序列；`latest` 通道跳到 `0.1.3+` 时如何对齐（是否改为跟随通道的自动机制）未定。
- **`host.ts` 文件超限（存量债务）**：`packages/dsh-session-manager/src/host.ts` 829 行（基线 813 行，本轮 +16 行），超过 code-spec 的 610 行上限。恢复条件：按职责拆分（子会话寻址与投影归一化可独立成模块）时另起 issue。

## 上下文

- [审阅文件](../../../../../.flow/quest/2026-09-09-dsh插件适配新版本.md)
- [ADR-0002 会话管理能力以模型工具面交付](../../../adr/0002-会话管理能力以模型工具面交付.md)
- [ADR-0003 内容搜索经上游 opt-in 工具与索引启用交付](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- [ADR-0004 会话初始化上下文以系统消息注入](../../../adr/0004-会话初始化上下文以系统消息注入.md)
- [前序 Plan：session 与 model 管理插件（安装与冒烟经验）](../../reference/2026-09-01-session与model管理插件/03-安装到web-profile并端到端冒烟.md)
- [前序 Plan：会话上下文注入与默认 workspace（inject 教训）](../../reference/2026-09-01-会话上下文注入与默认workspace/04-安装并端到端冒烟.md)
- [领域语言](../../../CONTEXT.md)

## Issue

| #   | Issue                                               | 状态        | 阻塞于 | 下一步         |
| --- | --------------------------------------------------- | ----------- | ------ | -------------- |
| 01  | [依赖声明对齐](01-依赖声明对齐.md)                  | completed   | —      | /code-delivery |
| 02  | [inject 与 stateOf 修复](02-inject与stateOf修复.md) | in_progress | —      | /code-delivery |
| 03  | [重装重启与真机冒烟](03-重装重启与真机冒烟.md)      | pending     | 01, 02 | /code-delivery |
