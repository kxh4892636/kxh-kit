---
status: completed
blocked_by: []
---

# spawn 重构抽 seam(prefactoring)

## 交付

`host.ts` 的 spawn 拆出 workspace 解析（`resolveSpawnLocation`）与上下文注入 seam，行为完全不变（既有 40 项测试守护）；为 02/03 并行实现铺路。

## 范围

- `host.ts`：新增 `resolveSpawnLocation(options, callerCwd?)`——决定 `{ workspaceId?, cwd? }`；当前行为：显式参数优先，否则 undefined（由 Host 回退）。
- spawn 调用点改走该 helper；注入点留 async 空钩子（默认 no-op）。
- 单测：既有行为锁定（显式 workspaceId/cwd 透传、都省时不变）。
- 不包含：默认 workspace 行为变更（02）、context 注入（03）。

## 直接依赖

无（根 issue；以 spec/ADR-0004/CONTEXT 为约束）。

## 验收

- [ ] `pnpm --filter @kxh4892636/dsh-session-manager test` 全部通过（含既有 40 项）
- [ ] 覆盖率 ≥80% 且无新增未覆盖分支
- [ ] `vp check` 通过；`vp pack` 构建通过
- [ ] 单测覆盖：显式 workspaceId/cwd 透传；两者省略时行为与之前一致。

## 上下文

- [spec](../../spec.md)
- 现有实现：`packages/dsh-session-manager/src/host.ts`（spawn）、`src/tools.ts`（session_spawn execute）

## 下一步

/code-delivery

## 交付记录

- **交付物**：`host.ts` 新增 `resolveSpawnLocation`(显式透传/省略返回空,行为不变)与 `ContextInstaller` seam + spawn `context` 参数(暂不注册);3 项新单测;主分支提交 `52f5bb4`。
- **验证证据**：`test` 43 项全部通过;覆盖率 98.13/90.19/98.46/99.49 ≥80%;`vp check` 无警告错误。
- 变异测试：未配置,`skipped: not configured`。
