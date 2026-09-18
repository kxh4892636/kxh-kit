---
name: domain
description: 创建、恢复或推进工作时使用；根据用户输入和工作区事实，就地维护领域文档与必备的 story、spec、notes，保留长程任务的决策、证据和恢复入口。
---

# Domain

1. **定位与恢复**：读取 [DOCUMENTS.md](DOCUMENTS.md), 定位并读取相关业务域文档; 旧记录与现场冲突时查明原因，保留来源与待确认项。
2. **就地更新**：按 [DOCUMENTS.md](DOCUMENTS.md) 维护领域文档，按 [TEMPLATES.md](TEMPLATES.md) 维护 Plan。根据每轮用户输入、取证、决策、实现与验证结果，进行创建/更新/删除/合并。
3. **检查接续**：通过 Plan，应能确定用户要什么、为何这样做、已经做到哪里、证据是什么、还缺什么及下一步如何执行。暂停、交接、上下文切换和交付前补齐当前检查点，明确未验证项与恢复条件。
4. **校验**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`，进行文档校验。
