---
status: pending
blocked_by: ["01"]
---

# spawn 默认 workspace = 调用方会话

## 交付

`session_spawn` 未给 workspaceId/cwd 时，新会话默认落在**调用方会话同一 workspace**（而非 Host 回退 cwd）。

## 范围

- `tools.ts`：`session_spawn.execute` 从 `exec.agent?.session` 取调用方 cwd/workspace 传入 host.spawn（经 01 的 seam）。
- `host.ts`：`resolveSpawnLocation` 增加 callerCwd 兜底。
- 描述更新：参数说明改为「缺省与调用方会话同 workspace」。
- 单测：未给参数 → 落在调用方 workspace；显式给出 → 覆盖；调用方无 cwd 时 → 回退既有行为。
- 不包含：context 注入（03）。

## 直接依赖

- 01：消费其 `resolveSpawnLocation` seam（本 issue 工作区与 03 不重叠：01 之内的拆解与参数透传区）。

## 验收

- [ ] 单测：默认 workspace = 调用方；显式覆盖；无 caller 回退
- [ ] `test` 全部通过 + 覆盖率 ≥80%；`vp check`/`vp pack` 通过
- [ ] 与 03 并行实现无文件冲突（合并后总测试全绿）

## 上下文

- [spec](../../spec.md)
- [ADR-0004](../../adr/0004-会话初始化上下文以系统消息注入.md)

## 下一步

/code-delivery
