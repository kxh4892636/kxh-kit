# 领域文档

在探索 workspace（工作区）时，应如何使用本工作区的领域文档。

## 规则

- 所有文件都创建在工作区根目录，而不是子仓库中；
- `docs/` 下的 ADR 和 Workflow 文件名及所有文档正文使用中文；约定名 `CONTEXT.md` 与 `domain-name` 除外；
- 每个 `docs/{domain-name}/CONTEXT.md` 行数 <= 610；每个领域的 `adr/*.md` 文件数 <= 89，行数 <= 144；每个领域的 `workflows/*.md` 文件数 <= 55，行数 <= 233；
- 如果超出任一限制，合并、拆分或删除超出的内容。

## 探索前先定位领域

1. 阅读工作区根目录下的 **`CONTEXT-MAP.md`**，确定即将处理的业务域及其关系。
2. 阅读对应业务域的 **`docs/{domain-name}/CONTEXT.md`**。
3. 阅读该业务域中与即将处理区域相关的 **`adr/`** 和 **`workflows/`**。

跨业务域工作需要读取所有相关业务域的领域文档及 `CONTEXT-MAP.md` 中的关系。

如果其中任何文件不存在，**静默继续**。不要报告文件缺失，也不要建议预先创建。只有在术语、决策或循环真正得到确认时，`/domain-modeling` skill（由 `/grill-with-docs` 进入）和 `/to-workflow` skill 才会按需创建它们。

## 布局

工作区默认采用 multi-context（多上下文）布局：

- 根目录 `CONTEXT-MAP.md` 只索引业务域及其关系。
- 每个业务域封装在 `docs/{domain-name}/` 中。
- `docs/{domain-name}/CONTEXT.md` 包含该业务域的 domain glossary（领域术语表）。
- `docs/{domain-name}/adr/` 包含该业务域的 ADR（Architecture Decision Record，架构决策记录）。
- `docs/{domain-name}/workflows/` 包含该业务域的 Workflow 规范。

```text
/
├── CONTEXT-MAP.md
├── docs/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   ├── adr/
│   │   │   └── 0001-采用事件溯源订单.md
│   │   └── workflows/
│   │       └── 0001-订单处理-创建-支付-履约.md
│   └── billing/
│       ├── CONTEXT.md
│       ├── adr/
│       └── workflows/
└── src/
```

`domain-name` 使用稳定、简短的 kebab-case 名称。新增业务域时同时把它加入 `CONTEXT-MAP.md`；跨业务域关系也只在 map 中定义一次。

## 使用术语表中的词汇

当输出需要命名领域概念时（例如 Issue 标题、重构提案、假设或测试名称），使用对应业务域 `CONTEXT.md` 中定义的术语。不要改用术语表明确排除的同义词。

如果所需概念尚未收录在术语表中，这是一个信号：要么你正在创造项目并未使用的语言（重新考虑），要么确实存在缺口（记录下来，交给 `/domain-modeling` 处理）。

## 明示 ADR 和 Workflow 冲突

如果输出与现有 ADR 或 Workflow 冲突，应显式指出，而不是静默覆盖：

> _与 ADR-0007（event-sourced orders）冲突——但值得重新讨论，因为……_
