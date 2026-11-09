---
name: "004-nano-flow开启时禁用压缩"
description: "会话激活 Nano Flow 时注册 `session_before_compact` 返回 `{ cancel: true }`，同时禁掉自动压缩（阈值 / overflow）与手动 `/compact`。"
status: completed
reason:
related_noted: ["003-真机走查与验收"]
---

# nano-flow 开启时禁用压缩

## 交付

`packages/pi-toolkit/src/nano-flow/register.ts`：

```ts
pi.on("session_before_compact", (_event, ctx) => {
  if (!activeOf(ctx)) return undefined;
  return { cancel: true };
});
```

- 门控与 `context` 过滤器同一口径（`activeOf`：`/toolkit` 开关 + `/nano-flow` 会话模式都开），关闭 Nano Flow 后压缩恢复。
- 不区分 `reason`：`manual`（`/compact`）、`threshold`（自动，`contextWindow - reserveTokens`）、`overflow`（溢出恢复）一律取消——按用户要求「自动和手动都禁止」。
- `packages/pi-toolkit/src/nano-flow/register.test.ts`：激活时 `session_before_compact` 返回 `{ cancel: true }`，未激活时返回 `undefined`。

## 已取证的行为（2026-11-09）

- pi 的手动路径 `AgentSession.compact()`：`cancel` → 抛 `Compaction cancelled` → `compaction_end{aborted:true}`，交互层 `showError("Compaction cancelled")`（`dist/modes/interactive/interactive-mode.js:3050`）。
- 自动路径 `_runAutoCompaction()`：`cancel` → 内部 catch → 返回 `false`，交互层 `showStatus("Auto-compaction cancelled")`；**不抛错，本轮继续**。
- overflow 路径同样被取消后不会重试压缩，最终以 provider 的上下文溢出错误结束。这是本 note 的已知代价。
- pi 判阈值的 `_exceedsCompactionThreshold` 走 `buildSessionProjection()`（磁盘全史，不经过 `context` hook），所以 Nano Flow 清空后阈值仍会被判定为超限 → 该提示可能反复出现。

## 风险与待定

1. **噪声**：阈值每轮都超 → 每轮一次 `Auto-compaction cancelled` 状态提示。先看真机是否刺眼；刺眼再考虑自己 `ctx.ui.notify` 收敛或加节流。
2. **溢出无兜底**：真正撞上窗口上限时会直接失败。Nano Flow 自己的 `rotateAt = 0.618` 通常会先清空，但清空只是 `context` 层过滤，磁盘历史照样增长；若出现 overflow 报错，需要再决定是否对 `reason === "overflow"` 放宽。
3. 不建议改 `compaction.enabled` 全局设置：那是用户级开关，会影响非 Nano Flow 会话，而且拦不住 `/compact`。

## 验收

- `pnpm --filter @kxh4892636/pi-toolkit check` + `test` 通过，新增用例覆盖激活/未激活两条。
- 真机：`/nano-flow` 开启后 `/compact` 报 `Compaction cancelled` 且上下文不变；关闭 Nano Flow 后 `/compact` 恢复正常。

## 结果

- `register.ts`：`pi.on("session_before_compact", (_event, ctx) => (activeOf(ctx) ? { cancel: true } : undefined))`，一行门控，与 `context` 过滤器同口径。
- `register.test.ts` 新增 `cancels manual, threshold and overflow compaction while Nano Flow is active`：三种 `reason` 都返回 `{ cancel: true }`；`switchOn: false` 与 `always: false` 两种关闭路径都返回 `undefined`。
- `README.md` 补 `Compaction disabled while active` 一条；`pi/CONTEXT.md` 的「上下文清空」词条补一句「是过滤不是截断，所以激活期间取消一切压缩」。
- 门禁：`test` 284 项全过，`check` 全绿。
- 未处理的风险保持原样：阈值提示可能每轮出现；`overflow` 被取消后撞上限会直接失败。

## 真机验证（2026-11-09，headless + RPC）

在临时工作区（`%TEMP%
f-verify`，不绑定任何 Plan）用 `pi --mode rpc` + `{"type":"compact"}` / `{"type":"prompt"}` 驱动真实会话，构造了三份合成会话文件：

| 会话 | 形态 | 观察 |
| --- | --- | --- |
| A `sess-active` | 80 条消息，本机配置 `always: true` → 激活 | `compaction_start{reason:"manual"}` → `compaction_end{aborted:true}`，响应 `success:false, error:"Compaction cancelled"`，会话里 `compaction` 条目 0 条 |
| B `sess-off` | 同上，末尾追加 `nano-flow-mode {enabled:false}` | 真实压缩成功（28s 摘要），会话末尾新增 1 条 `compaction` 条目 |
| C `sess-threshold` | 200 条消息，项目级 `.pi/settings.json` 把 `compaction.reserveTokens` 设为 940000 → 阈值降到 60k | 发 `prompt` 后自动压缩触发：`compaction_start{reason:"threshold"}` → `compaction_end{aborted:true}`，无 `compaction` 条目 |

- A/C 两组是「取消」，B 是对照（证明开关一通就恢复、且合成会话确实够大到需要压缩）。
- C 组在 `compaction_end` 一出现就 kill 进程，避免真把 150k tokens 发给模型。
- `overflow` 路径没有单独复现：它与 `threshold` 共用 `_runAutoCompaction()` 的同一段 `session_before_compact` 处理，单测已覆盖 `reason: "overflow"` 返回 `{ cancel: true }`。
- 未污染仓库：临时目录已删除，`git status` 干净，没有 Plan 的 `log.jsonl` 被写入。
