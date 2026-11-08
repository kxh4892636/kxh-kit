---
name: '001-nano-flow重构'
description: '把 nano-flow 重构为 YAML 文档、生成索引、create/check 双工具与预设提示词注入。'
status: completed
reason:
related_noted:
  - '002-生成并迁移dsh领域文档'
  - '003-迁移dsh旧plans'
next_step: '等待用户验收；插件已安装 0.5.10'
---

# 001-nano-flow重构

## 交付

- 文档格式：YAML 头、三位 name、story 并入 spec、note 四态（`pending` / `in_progress` / `blocked` / `completed`）、`related_noted` 关联而非 DAG。
- 生成物：`CONTEXT-MAP.md`、questions/adr/workflows 索引、`notes_index.md` 与 spec 的 `## 追踪 Note` 全部由 `nano_flow_check` 生成。
- 工具面：只保留 `nano_flow_create` 与 `nano_flow_check`；旧 read/write/repair/ready 工具移除。
- 预设注入：`prompts/agents.md` + `GUIDE.md` 快照 + `prompts/limit.md` 生成的篇幅限制块；每轮用户输入另走 `prompts/user.md` 运行时上下文。
- 技能：`ask` / `do` 两个循环，保留会话轮转、设置面板与预设选择。
- 篇幅限制：description 233 字；移除索引行数与 ADR 数量约束；spec 超限留指针，note/question/ADR/workflow 超限拆成多个独立文档，CONTEXT 只压缩，规则统一收口在 `limit.md`。
- 版本推进到 0.5.10；测试 237 项通过。

## 验证

`vp check` 通过；`nano_flow_check` 幂等；插件打包并安装到 desktop profile，宿主重启后可验证提示词、两个工具与 ask/do skill。

## 关键提交

`d1cddc70`（重构主体）、`7d0bd32c`（篇幅限制）、`c104d0ca`（limit.md）、`c55ac0cb`（spec 指针）、`57e5c238`（拆分规则）、`6e3d34a1`（规则收口）。
