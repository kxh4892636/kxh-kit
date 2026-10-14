---
name: kaizen
description: 用户在 Plan 完成后手动调用时使用；依据交付证据完善对应业务域的 CONTEXT 与 ADR，总结 QUESTIONS，并沉淀可复用的业务域工作流。
disable-model-invocation: true
---

# Kaizen

一次循环将已完成 Plan 的经验转为可复用领域知识。

## 复盘循环

1. **定位**：确定用户指定的 Plan；未指定且存在多个候选时，请用户选择。完整读取 story、spec、索引中的 notes 与验证证据，通过 CONTEXT-MAP 定位涉及的业务域，再读取对应 CONTEXT、QUESTIONS、ADR 和已有 workflow。
2. **沉淀**：按下方「知识归属」就地更新对应文档。先合并已有内容，再补缺；跨域内容确定唯一 owner，其他域引用。没有符合条件的新增结论时如实说明，不为凑齐产物制造领域知识或 workflow。
3. **校验**：修正受影响的索引与相对链接，从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`。逐项确认知识有证据、工作流能脱离本次 Plan 执行、重复执行不会产生重复条目；校验失败如实报告并修复本次引入的问题。
4. **交接**：报告变更文件、提炼结论、未沉淀项及原因。

## 知识归属

CONTEXT、QUESTIONS 与 ADR 的格式和准入统一遵循 `/domain skill`。

## 工作流

**Workflow**：沉淀在 `docs/{domain-name}/workflows/` 下的可复用业务域工作流，目录、命名与准入统一遵循 `/domain skill` 的 Workflow 规则。

- 先读取该域 `workflows/INDEX.md` 与已有 workflow，按 `/to-skill skill` 抽象可重复的业务活动；覆盖同一活动时就地完善或合并，不新建近似条目。
- 新增或变更后，同步 `INDEX.md` 的路径-触发条件索引；触发条件说明何时必须加载该 workflow，而不是步骤摘要。
- 该域尚无 `workflows/` 时，按 `/domain skill` 的布局创建 `INDEX.md` 与首个 workflow 目录。
