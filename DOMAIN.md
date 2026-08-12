# 领域文档

在探索 workspace（工作区）时，应如何使用本工作区的领域文档。

## 规则

- 所有文件都创建在工作区根目录，而不是子仓库中；
- `docs/` 目录下的所有文件名和文件内容使用中文；
- `CONTEXT.md` 行数 <= 610；`docs/adr/*.md` 文件数 <= 89，行数 <= 144；`docs/workflows/*.md` 文件数 <= 55，行数 <= 233；
- 如果超出任一限制，合并、拆分或删除超出的内容。

## 探索前先阅读

- 工作区根目录下的 **`CONTEXT.md`**。
- **`docs/adr/`**——阅读与即将处理的区域相关的 ADR。
- **`docs/workflows/`**——阅读与即将处理的区域相关的 Workflow。

如果其中任何文件不存在，**静默继续**。不要报告文件缺失，也不要建议预先创建。只有在术语或决策真正得到确认时，`/domain-modeling` skill（由 `/grill-with-docs` 进入）和 `/to-workflow` skill 才会按需创建它们。

## 布局

本工作区采用 single-context（单上下文）布局：

- 工作区根目录下的 `CONTEXT.md` 包含 domain glossary（领域术语表）。
- `docs/adr/` 包含 ADR（Architecture Decision Record，架构决策记录）。
- `docs/workflows/*.md` 包含 Workflow 规范。

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
├── docs/workflows/
│   ├── 0001-ordering-workflow.md
│   └── 0002-billing-workflow.md
└── src/
```

## 使用术语表中的词汇

当输出需要命名领域概念时（例如 Issue 标题、重构提案、假设或测试名称），使用 `CONTEXT.md` 中定义的术语。不要改用术语表明确排除的同义词。

如果所需概念尚未收录在术语表中，这是一个信号：要么你正在创造项目并未使用的语言（重新考虑），要么确实存在缺口（记录下来，交给 `/domain-modeling` 处理）。

## 明示 ADR 和 Workflow 冲突

如果输出与现有 ADR 或 Workflow 冲突，应显式指出，而不是静默覆盖：

> _与 ADR-0007（event-sourced orders）冲突——但值得重新讨论，因为……_
