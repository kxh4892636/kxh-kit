---
name: "003-提供Plan绑定工具"
description: "新增 nano_flow_bind：同一会话只保留一个绑定，再次调用即切换，并让看板与 log 跟随。"
status: blocked
reason: "等待用户验收 nano_flow_bind：绑定/切换、看板与 log 跟随已实现并通过测试"
related_noted:
  - "001-梳理会话Plan绑定机制"
  - "002-为GUIDE增加仅dream可写约束"
next_step: "用户验收后置 completed；未覆盖的 check domain 过滤与生命周期迁移缺陷另开 note。"
---

# 003-提供Plan绑定工具

交付：新增 `nano_flow_bind`，把当前会话绑定到指定 Plan；同一会话只保留一个绑定，再次调用即切换，Note 看板与后续 `log.jsonl` 跟随。验收：三种写入路径语义清楚；切换后日志不再写旧 Plan；测试与类型检查通过。

## 决策

- **显式工具覆盖，隐式路径不覆盖**：`nano_flow_bind` 调用 `rebindSession` 直接覆盖旧绑定；`nano_flow_check` 与 plan-log 的首个工具调用自动绑定仍保持「已绑定则不动」，避免隐式流程抢走用户选择。
- **Plan 解析**：`plan` 必填（Plan 目录名）；`domain` / `lifecycle` 可选，用于同名 Plan 消歧；找不到或匹配多个都报错并列出候选。
- **日志切换**：plan-log 在每次 flush 时读取绑定表并比较 `cwd + planPath`。发现切换就重扫新 Plan 的 `log.jsonl` 建 `seen` / 段头索引，但**不回填**旧 Plan 的历史轮次，也不关闭会话持久化句柄；当前未结束轮保留在缓冲里，`turn/end` 时整轮写入新 Plan。
- **看板**：`notesOf` 每次请求都读绑定表，切换后下一次 5s 轮询即换 Plan。
- **旧日志**：旧 Plan 的 `log.jsonl` 保留已写入轮次，不再追加；不迁移、不删除。

## 实现

- 新工具 [`tools/bind.ts`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/bind.ts)：参数校验、Plan 解析、调用 `runtime.rebind`。
- [`tools/shared.ts:114`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/shared.ts#L114)：新增 `rebind`，缺会话或宿主能力时抛错（显式工具要让用户看到失败）。
- [`host/nano-flow-facade.ts:26`](../../../../../../packages/dsh-toolkit/src/host/nano-flow-facade.ts#L26) 与 [`index.ts:441`](../../../../../../packages/dsh-toolkit/src/index.ts#L441)：新增 `rebindSession` / `replaceBinding`，覆盖绑定表条目。
- [`plugin.ts:178`](../../../../../../packages/dsh-toolkit/src/nano-flow/plugin.ts#L178)：注册第三个工具，并把 `rebind` 接到 facade。
- [`plan-log-service.ts:159`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L159)：按绑定身份检测切换并重置日志目标；[`plan-log-service.ts:251`](../../../../../../packages/dsh-toolkit/src/nano-flow/plan-log-service.ts#L251) 每次 flush 都刷新绑定。
- `system.md`、README、dsh CONTEXT 补充工具说明与调用口径。

## 验证

- 新增 `bind.test.ts`：同会话跨 Plan/生命周期连续绑定、同名 Plan 用 domain 消歧、未知 Plan/非法 lifecycle/缺会话报错。
- `plan-log-service.test.ts` 新增切换用例：turn 1–2 写旧 Plan，切换后 turn 3 只写新 Plan，旧 Plan 保留 `[1, 2]`。
- `pnpm -C packages/dsh-toolkit test`：38 个测试文件、325 项全部通过。
- `pnpm -C packages/dsh-toolkit check`：格式、lint 与类型检查通过。

## 未覆盖

- R1：`nano_flow_check({domain})` 的绑定目标仍按全工作区唯一 active Plan 计算。
- R3：Plan 在 active/reference/archived 之间移动后，已有绑定仍指旧路径。
- R4：会话删除/轮转后的死条目仍无回收。

## 相关

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md) — R2「同会话无法换 Plan」由本 note 解决。
- [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md) — 同一轮迭代的另一项改动。
