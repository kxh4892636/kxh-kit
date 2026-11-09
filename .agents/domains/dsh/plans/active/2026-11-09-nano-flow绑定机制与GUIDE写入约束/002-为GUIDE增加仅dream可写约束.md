---
name: "002-为GUIDE增加仅dream可写约束"
description: "确定 GUIDE 的写入边界与空模板初始化：正文只由 dream 维护，create 只补空文件。"
status: completed
related_noted:
  - "001-梳理会话Plan绑定机制"
  - "003-提供Plan绑定工具"
next_step: "已验收；后续改动注意不要把正文写入混进 create 的空模板初始化。"
---

# 002-为GUIDE增加仅dream可写约束

交付：把「GUIDE.md 正文只由 dream 维护」写成日常会话可执行的约束，同时保留 `nano_flow_create` 的空模板初始化。验收：提示词明确禁止改正文；create 只补缺失的空文件；测试覆盖；`nano_flow_check` 通过。

## 事实核查

用户前提「GUIDE.md 只能通过 dream 机制更新」此前只是约定，不是事实：

- dream 父会话负责整体重写 GUIDE（`dream.md` 的晋升与汇总步骤，子 agent 明令禁写）。
- `nano_flow_create kind=domain` 在 GUIDE 缺失时会写一份空模板（[`nano-flow/tools/create.ts:112`](../../../../../../packages/dsh-toolkit/src/nano-flow/tools/create.ts#L112)）。
- `system.md` 没有任何一句禁止日常 Plan 改 GUIDE；维护循环只说更新 common 与所属域文档，边界不清。
- git 历史里 GUIDE 最后一次改动是日常 Plan 提交 `9ccc6a5`，不是 `docs(dream)` 提交。

结论：需要约束的是**正文写入**；空模板初始化本身不承载内容，可以保留。

## 最终约束

- `system.md`：目录布局标注「仅 dream 维护」，新增 `## 写入边界` 段；日常 Plan（`/ask`、`/do` 与维护循环）不得修改、移动或删除 GUIDE，`nano_flow_create` 只允许在缺失时创建空模板、不得写入或改写正文。维护循环的「更新」显式排除 GUIDE。
- `create.ts`：`kind=domain` 恢复写 `guide.md` 空模板（`writeIfMissing`，已有文件绝不覆盖），工具描述写明「GUIDE 正文只由 dream 维护」。
- `dream.md`：保持原样，不额外添加 GUIDE 约束（按用户要求）。
- `README.md` / `dsh/CONTEXT.md`：同步空模板例外与「正文只由 dream 重写」的口径。
- 测试恢复对 `templates/guide.md` 与建 domain 后空 GUIDE 的断言。

## 为什么不收紧到“完全不创建”

空模板只是占位，不承载任何结论；允许初始化可以让目录布局稳定，也避免把「文件是否存在」误当成「dream 是否维护过」。真正的边界是：除 dream 外，任何流程都不得写入或改写正文。

## 验证

- `pnpm -C packages/dsh-toolkit test`：38 个测试文件、325 项全部通过。
- `pnpm -C packages/dsh-toolkit check`：格式、lint 与类型检查全部通过。
- `nano_flow_check(plan: "2026-11-09-nano-flow绑定机制与GUIDE写入约束")`：通过。

## 相关

- [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md) — 同一轮迭代的只读梳理。
- [003-提供Plan绑定工具](003-提供Plan绑定工具.md) — 同一轮迭代的绑定改动。
