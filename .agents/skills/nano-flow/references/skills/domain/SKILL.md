---
name: domain
description: 创建、恢复或推进工作时使用；根据用户输入和工作区事实，就地维护领域文档与必备的 story、spec、notes，保留长程任务的决策、证据和恢复入口。
---

# Domain

每轮用户输入、取证、决策、实现或验证形成新事实后，执行一次维护循环。任务必须维护 story、spec 和至少一份 note。

## 维护循环

1. **定位**：从 CONTEXT-MAP 找到所属域，读取相关 CONTEXT、QUESTIONS 与 ADR；恢复任务时依次读取 story、spec、索引中的 notes 及其依赖，对照工作区事实核对当前进度。冲突查明来源，未知项保留待定。
2. **更新**：任务目标、方案和工作进展按 [PLAN.md](PLAN.md) 就地维护；新增业务域或沉淀稳定术语、重复问题、重要决策时，按 [KNOWLEDGE.md](KNOWLEDGE.md) 维护领域知识。依据新事实创建、修改、删除或合并，结论只在所属文档定义一次，其他位置引用。
3. **同步**：修正受影响的引用、依赖、状态与恢复入口；删除或合并前将仍有效的需求、证据和未完成工作迁入保留文档。暂停、交接或上下文切换前，确保仅凭 Plan 能判断目标、理由、进度、证据、缺口和下一步。
4. **校验**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`，修复本次更新引入的不一致；历史缺项和未验证内容如实保留，不补造事实。

## 布局

```text
CONTEXT-MAP.md
docs/{domain-name}/
├── CONTEXT.md
├── QUESTIONS.md
├── adr/
│   └── 0001-中文决策名.md
└── plans/{lifecycle}/
    └── YYYY-MM-DD-中文工作名/
        ├── story.md
        ├── spec.md
        └── 01-中文标题.md
```

domain-name 使用 kebab-case，共享领域为 `common`；lifecycle 见 [PLAN.md](PLAN.md)。Plan 内不嵌套目录；正文使用中文，域内链接从当前文件计算相对路径。
