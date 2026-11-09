---
name: "001-梳理会话Plan绑定机制"
description: "查清绑定表、写入时机、消费方与当前缺陷，给出依赖清单。"
status: completed
related_noted:
  - "002-为GUIDE增加仅dream可写约束"
next_step: "已交付；改动绑定前先读本清单的缺陷与证据。"
---

# 001-梳理会话Plan绑定机制

交付：会话↔Plan 绑定机制的完整事实清单，含存储、写入路径、消费方与已知缺陷。验收：每条结论都能在源码里回读；`nano_flow_check` 通过且本 note 置 completed。

## 存储

绑定表是宿主级 JSON：默认 `$DSH_HOME/toolkit/nano-flow-plan-bindings.json`，可由插件配置 `bindingsFile` 覆盖（[`index.ts:72`](../../../../../../packages/dsh-toolkit/src/index.ts#L72)、[`index.ts:117`](../../../../../../packages/dsh-toolkit/src/index.ts#L117)）。结构为 `Record<sessionId, { planPath, cwd, boundAt }>`，`planPath` 统一按工作区写成相对路径（[`plan-log.ts:307`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L307)）。读失败或损坏时按空表处理（[`plan-log.ts:260`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L260)）。

绑定是**每会话一次**：`recordBinding` 发现该会话已有条目就直接返回，不更新、不换绑（[`index.ts:100`](../../../../../../packages/dsh-toolkit/src/index.ts#L100)）。因此同一会话无法从 Plan A 改绑到 Plan B；换绑只能靠新会话。

## 写入路径（共三条）

1. **`nano_flow_check` 成功后**：目标 Plan 的计算是——带 `plan` 参数时按目录名跨 active/reference/archived 定位；不带时取「全工作区恰好一个 active Plan」；两者都不满足则不绑（[`nano-flow/tools/check.ts:34`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/check.ts#L34)）。随后用 `exec.agent.session.id` 经 facade 写入（[`nano-flow/tools/shared.ts:101`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/shared.ts#L101)、[`nano-flow/plugin.ts:121`](../../../../../../packages/dsh-toolkit/src/nano-flow/plugin.ts#L121)、[`index.ts:418`](../../../../../../packages/dsh-toolkit/src/index.ts#L418)）。
2. **plan-log 自动绑定**：会话首个 `tool/call` 时，若预设已是 nano-flow（老宿主无法判定时只认 `nano_flow_*` 调用）、当前无绑定且工作区恰好一个 active Plan，就写入绑定（[`nano-flow/plan-log-service.ts:158`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L158)）。这条路径与 check 独立，可能先于用户的显式确认。
3. **轮转继承**：新会话创建后 autoCheck 读旧会话的绑定，目录仍存在就写给新会话（[`index.ts:175`](../../../../../../packages/dsh-toolkit/src/index.ts#L175)、[`plan-log.ts:295`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L295)）。与工作区 active Plan 数量无关。

`nano_flow_create` **不写绑定**；没有任何删除或回收绑定的路径。

## 消费方

- **Note 看板**：宿主路由 `notesOf(sessionId)` 读绑定 → 绝对 Plan 目录 → 未完成 note；未绑定、目录不存在或没有未完成 note 时返回 `null`，面板不渲染（[`index.ts:440`](../../../../../../packages/dsh-toolkit/src/index.ts#L440)）。客户端仅在 nano-flow 预设会话里每 5 秒轮询该快照（[`client/notes-dock.ts:115`](../../../../../../packages/dsh-toolkit/src/client/notes-dock.ts#L115)）。
- **Plan 轨迹日志**：plan-log 按绑定路径把每轮 compact 记录追加到 `<plan>/log.jsonl`（[`nano-flow/plan-log-service.ts:209`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L209)、[`plan-log.ts:312`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L312)）；这是 dream 的唯一输入。无绑定且不满足自动绑定条件时，这一轮的轨迹不记录。
- **轮转 seed**：继承到的绑定决定 seed 的「恢复当前 Plan」与看板是否立即出现；没有绑定则 seed 构建退回「工作区唯一 active Plan」只作文字提示（[`nano-flow/rotate.ts:240`](../../../../../../packages/dsh-toolkit/src/nano-flow/rotate.ts#L240)）。
- **恢复入口**：`nano_flow_check` 的 `plan` 参数让 reference/archived Plan 也能定位并绑定（ADR 008）。

不依赖绑定：note/spec 的读写与状态、check 的校验结果、`nano_flow_create`、撤回与会话轮转本身。

## 已知缺陷与风险

- **R1 domain 过滤不参与绑定目标**：`check({domain:"x"})` 仍按全工作区 active Plan 计算目标，可能把会话绑到另一个域的唯一 Plan（[`nano-flow/tools/check.ts:34`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/check.ts#L34)）。
- **R2 同会话无法换 Plan**：`recordBinding` 先写先赢，而 system.md 允许同一会话在「新目标」下建新 Plan；看板与日志会继续留在旧 Plan（[`index.ts:100`](../../../../../../packages/dsh-toolkit/src/index.ts#L100)）。已由 003 的 `nano_flow_bind` 解决（显式覆盖）。
- **R3 生命周期迁移后绑定失效**：active→reference/archived 移动目录后，绑定仍指旧路径；看板变空，plan-log 继续向旧路径追加，`mkdir` 会重建已移走的目录并留下孤儿 `log.jsonl`（[`nano-flow/plan-log-service.ts:224`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L224)、[`plan-log.ts:312`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L312)）。
- **R4 死条目无回收**：会话删除或轮转后条目只增不减；ADR 008 已明确承认，留待维护回收。
- **R5 自动绑定可能违背意图**：nano-flow 会话只是问一个问题、工作区又恰好一个 active Plan 时，首个工具调用就会绑定（[`nano-flow/plan-log-service.ts:171`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L171)）。
- **R6 cwd 漂移**：绑定保存写入时的 `cwd`，`notesOf` 优先用它；而 `inheritedPlanDirectory` 用 `join(workspace, planPath)`，对绝对 `planPath` 不兼容（[`index.ts:452`](../../../../../../packages/dsh-toolkit/src/index.ts#L452)、[`plan-log.ts:302`](../../../../../../packages/dsh-toolkit/src/plan-log.ts#L302)）。
- **R7 遗留启发式**：`notesForWorkspace` 仍保留「唯一 active Plan」逻辑但没有生产调用（[`nano-flow/notes.ts:105`](../../../../../../packages/dsh-toolkit/src/nano-flow/notes.ts#L105)）。

## 证据

- 源码：上列行号；ADR `dsh/adr/008-轮转绑定继承旧会话的Plan.md`。
- 测试：`index.test.ts`（未绑定不显示面板）、`plan-log-service.test.ts`（自动绑定与多 Plan 跳过）、`notes.test.ts`。
- 交付核对：运行 `nano_flow_check` 通过。
