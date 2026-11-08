---
name: "017-轮转后自动校验Plan并绑定看板"
description: "轮转创建新会话后自动执行一次 nano_flow_check：校验 Plan 并建立会话↔Plan 绑定，让 Note 看板立即出现。"
status: completed
related_noted:
  - '010-轮转保留分组与置顶'
  - '012-rotate命令与轮转输入标注'
  - '015-Plan绑定贯通Note面板'
---

# 017-轮转后自动校验Plan并绑定看板

## 需求（用户）

轮转添加一个逻辑：恢复 Plan 之后**必须自动执行一次 `nano_flow_check`**。目的有二：

1. 检验 Plan 是否正确（YAML 头、篇幅、状态派生、索引一致性）；
2. 触发工具、建立会话↔Plan 绑定，让 Note 看板在新会话里立即出现。

## 现状

- 轮转只做 create → 继承分组/置顶 → 投 seed → retire（`rotate.ts:279-292`）。
- 绑定由 `nano_flow_check` 执行时经宿主 facade 写入（015）；轮转出来的会话没有 `agent-preset/selected` 事件，`tool/call` 快路径不触发 flush（016），所以新会话要等模型自己跑一次 check，看板才出现。

## 设计

在轮转的 `replacement()` 里、seed 投递**之前**跑一次校验，落在宿主侧而不是靠模型遵守提示词：

- `RotationOptions` 新增 `autoCheck?(params: { sessionId, workspace }): Promise<string | undefined>`。
- `replacement()` 在 `inheritPlacement` 之后调用它；返回的摘要追加到 seed 末尾，失败只 warn、不阻断轮转。
- 根插件（`index.ts`）实现 `autoCheck`：`runCheck` 跑随包校验脚本（与工具同一实现）→ 工作区恰好一个 active Plan 时 `runtime.bindSession` 写绑定 → 返回一行结论。

为什么放宿主侧：模型可能不遵守 seed；而且绑定写入本来就是工具内部行为（015），宿主直接调同一 facade 等价，且新会话一打开看板就在。

## 验收

- 单测：`replacement` 调用 `autoCheck`、seed 含摘要、失败不阻断轮转、手动与自动两条路径都走。
- `vp check` / `vp test src` 通过。
- live：重启宿主后 `/rotate`，新会话首条 seed 带校验结论、看板立即出现、`nano-flow-plan-bindings.json` 有新会话。
## 实现（0.5.28）

- `rotate.ts`：`RotationOptions` 新增 `autoCheck({ sessionId, workspace })`；`replacement()` 在 `inheritPlacement` 之后、`buildSeed` 之前调用它，返回值用空行拼到 seed 末尾。`runAutoCheck` 捕获异常后只 warn，并把失败原因写进 seed（不阻断轮转）。手动 `/rotate` 与阈值自动轮转共用这段，因此两条路径都覆盖。
- `index.ts`：实现 `autoCheck` —— `runCheck`（与工具同一份 `check-domain.mjs`，参数 workspace/domains/limits 一致）→ `listActivePlans` 恰好一个时 `runtime.bindSession(sessionId, plan, workspace)`（与工具走同一个 facade）→ 拼一行结论：通过 / 失败前 5 项 + 剩余条数 / 是否建立看板绑定。
- `prompts/system.md`：恢复与轮转一节加一条，说明轮转后会自动校验、结论在 seed 里、通过则不必重复跑。
- 版本 0.5.28，已 `pnpm add` 进 desktop 与 web profile。

## 门禁（2026-11-08）

- `vp test src/nano-flow`：13 文件 / **96 例通过**（新增 3 例：手动轮转带摘要、自动路径带摘要且用户输入仍被 XML 包裹、校验抛错时仍轮转并把失败写进 seed）。
- `vp check`：123 文件格式、94 文件 lint/类型全通过。
- `vp run build` 成功，`dist/index.mjs` 含 `autoCheck` 与「轮转后自动执行」文案；安装包已替换两个 profile 的 `node_modules`。

## live 验收（2026-11-08，用户确认）

用户重启宿主（载 0.5.28）后手动 `/rotate`：命令先排队，点击发送后触发轮转。新旧会话都逐条核对：

1. **seed 带校验结论**——新会话 `session-de913589-3dd9-478c-baeb-b87d9d4843aa` 首条 seed 末尾两行与 `autoCheck` 输出逐字一致（`index.ts:192` / `:201`）：通过 + 看板绑定已建立。
2. **看板立即出现**——用户目视确认新会话打开即见 Note 看板，不必等模型调工具。
3. **绑定表在轮转时写入**——`$DSH_HOME/toolkit/nano-flow-plan-bindings.json` 该会话 `boundAt 2026-11-08T10:42:26.340Z`（本地 18:42:26），早于新会话任何工具调用；种子投递顺序为 create → inheritPlacement → autoCheck → buildSeed（`rotate.ts:303-319`），所以看板数据在首条消息前就已就绪。

旁证：同时段 4 次手动轮转（e9faa350 → 9166bfb7 → 641a7f1d → de913589）每个新会话的 `log.jsonl` 均有独立段头 + turn 1，旧会话按设计被物理删除；新会话段头与 turn 在 `turn/end` 落盘（与 011/016 一致）。
