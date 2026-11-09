---
name: "002-为GUIDE增加仅dream可写约束"
description: "确定约束落点与强度，修正日常流程与 nano_flow_create 对 GUIDE.md 的写入。"
status: blocked
reason: "等待用户验收严格方案：已禁止日常写入并移除 nano_flow_create 对 GUIDE 的创建"
related_noted:
  - "001-梳理会话Plan绑定机制"
next_step: "用户验收后置 completed；若改选仅提示词方案，回退 create.ts 与 runtime.test.ts 的改动。"
---

# 002-为GUIDE增加仅dream可写约束

交付：把「GUIDE.md 只能由 dream 维护」写成日常会话不可绕过的约束，并让工具行为与之一致。验收：新会话提示词明确禁止；不存在日常路径创建或改写 GUIDE；测试覆盖；`nano_flow_check` 通过。

## 事实核查

用户前提「GUIDE.md 只能通过 dream 机制更新」此前只是约定，不是事实：

- dream 父会话确实负责整体重写 GUIDE（`dream.md` 的晋升与汇总步骤，子 agent 明令禁写）。
- 但 `nano_flow_create kind=domain` 在 GUIDE 缺失时会写一份空模板（原 [`nano-flow/tools/create.ts:112`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/create.ts#L112)），工具描述也宣称会建 GUIDE。
- `system.md` 没有任何一句禁止日常 Plan 改 GUIDE；维护循环只说更新 common 与所属域文档，边界不清。
- git 历史里 GUIDE 最后一次改动是日常 Plan 提交 `9ccc6a5`，不是 `docs(dream)` 提交。

结论：只加提示词无法让「仅 dream」成立，必须同时切断 `nano_flow_create` 这条写入路径。

## 已实施（严格方案）

- `system.md`：目录布局标注「仅 dream 维护」，新增 `## 写入边界` 段，明确日常 Plan（`/ask`、`/do`、维护循环与 `nano_flow_create`）不得创建、修改、移动或删除 GUIDE；维护循环的「更新」显式排除 GUIDE。
- `create.ts`：`kind=domain` 不再读取 `guide.md` 模板、不再写 `GUIDE.md`；工具描述改为「GUIDE.md 只由 dream 维护，本工具不创建」。
- `dream.md`：写入边界改为「`GUIDE.md`（仅父会话整体重写）」，并补一句日常会话不得创建/修改/移动/删除它。
- 删除空模板 `src/nano-flow/templates/guide.md`；`README.md` 的目录布局、工具说明、验证步骤同步。
- `dsh/CONTEXT.md`：记忆分层补「L3 只由 dream 父会话整体重写」；新增「会话↔Plan 绑定」术语，修正 Note 面板与轨迹日志的旧描述。

## 为什么移除初始化

空或缺失的 GUIDE 在插件侧本来就被安全跳过（`guideOf` 读失败返回空串）；保留空模板只会让「仅 dream」留下例外，也让日常误建与 dream 正常创建无法区分。新 domain 在 dream 首次运行前没有 GUIDE 是预期状态。

## 验证

- `pnpm -C packages/dsh-toolkit test`：37 个测试文件、321 项全部通过（runtime 测试已改为断言建 domain 后 GUIDE 不存在）。
- `pnpm -C packages/dsh-toolkit check`：格式、lint 与类型检查全部通过。
- `nano_flow_check(plan: "2026-11-09-nano-flow绑定机制与GUIDE写入约束")`：通过。

## 相关

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md) — 同一轮迭代的只读梳理；绑定缺陷另议。
