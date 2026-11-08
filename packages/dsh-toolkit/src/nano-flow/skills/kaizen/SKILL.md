---
name: kaizen
description: 用户在 Plan 完成后手动调用时使用；依据交付证据完善对应业务域的 CONTEXT、questions 与 ADR，并沉淀可复用的业务域工作流。
disable-model-invocation: true
---

# Kaizen

一次循环将已完成 Plan 的经验转为可复用领域知识。

## 复盘循环

1. **定位**：确定用户指定的 Plan；未指定且存在多个候选时，请用户选择。完整读取 spec、notes_index 与关联 note 的验证证据，通过 `CONTEXT-MAP.md` 定位涉及的业务域，再读取对应 CONTEXT、questions、adr 和已有 workflow。
2. **沉淀**：按下方「知识归属」就地更新对应文档。先合并已有内容，再补缺；跨域内容确定唯一 owner，其他域引用。没有符合条件的新增结论时如实说明，不为凑齐产物制造领域知识或 workflow。
3. **校验**：修正受影响的索引与相对链接，跑 `nano_flow_check`；该命令会重新生成 `CONTEXT-MAP.md`、`questions/index.md`、`adr/index.md`、`workflows/index.md` 与 spec 的 `## 追踪 Note`。逐项确认知识有证据、工作流能脱离本次 Plan 执行、重复执行不会产生重复条目；校验失败如实报告并修复本次引入的问题。
4. **交接**：报告变更文件、提炼结论、未沉淀项及原因。

## 知识归属

- 稳定术语与域职责 → `CONTEXT.md` 的 `## Language`；
- 重复出现且有验证方法的问题 → `questions/NNN-中文问题.md`；
- 难以逆转、缺少上下文会显得意外、存在真实备选的决策 → `adr/NNN-中文决策.md`；
- 脱离本次 Plan 仍可复用的业务活动 → `workflows/NNN-中文工作流/NNN-中文工作流.md`。

文档头、命名与准入统一遵循 `prompts/system.md`。索引文件由 check 生成，不要手改。

## 工作流

- 先读取该域 `workflows/index.md` 与已有 workflow，按 `/to-skill skill` 抽象可重复的业务活动；覆盖同一活动时就地完善或合并，不新建近似条目。
- 新增或变更后，把触发条件写进 workflow 的 `description`；索引由 check 更新。
- 该域尚无 `workflows/` 时，按 `prompts/system.md` 的布局创建 `index.md` 与首个 workflow 目录。
