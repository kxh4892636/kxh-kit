# 领域文档

## 布局与归属

```text
/
├── CONTEXT-MAP.md
└── docs/
    ├── common/
    │   ├── CONTEXT.md
    │   └── QUESTIONS.md
    └── {domain-name}/
        ├── CONTEXT.md
        ├── QUESTIONS.md
        ├── adr/
        │   └── 0001-中文决策名.md
        └── plans/
            ├── planning/
            │   └── YYYY-MM-DD-中文工作名/
            │       ├── story.md
            │       ├── spec.md
            │       └── 01-中文标题.md
            ├── implementing/
            ├── reference/
            └── archived/
```

- `CONTEXT-MAP.md` 只索引业务域及其关系；跨域关系只定义一次。
- `docs/common/` 承载多个业务域共同贡献的领域术语和 ADR。
- `docs/{domain-name}/CONTEXT.md` 只承载该业务域的 glossary;
- `docs/{domain-name}/QUESTIONS.md` 记录该业务域工作中反复出现的问题与经过验证的解决方法。;
- `docs/{domain-name}/adr/` 承载该业务域拥有的 ADR；跨域决策只选择一个 owner，其他域使用链接引用。
- `docs/{domain-name}/plans/` 承载业务域的 story, spec 和 notes;

## 文档约束

- 新增业务域时同步创建 `QUESTIONS` 和 `CONTEXT.md` 并加入 `CONTEXT-MAP.md`。
- `docs/` 下的所有文件内容正文使用中文;

## Plan 生命周期

```text
新建 ──> planning ──开始实现──> implementing ──完成且仍有参考价值──> reference
             │                     │                                  │
             └─废弃或不再推进───────┴─废弃或不再有用──> archived <──失去参考价值─┘
```

- `planning/`：讨论需求、澄清设计、制定方案或等待实现，尚未开始实现；新 Plan 一律创建于此，已有 Issue 均为 `pending`。
- `implementing/`：已开始实现，正在推进开发、测试与验收；开始实现前将整个 Plan 从 `planning/` 迁入此处。
- `reference/`：全部 issue 已完成，且内容仍有参考价值。
- `archived/`：已废弃、已过时或不再有用；内容冻结，不再更新，也不再作为权威来源。

## CONTEXT

从用户输入、代码与已确认决策提取稳定术语，就地创建、修订、去重或删除过时定义；

CONTEXT-MAP 模板：

```markdown
# Context Map

## Contexts

- [订单](./docs/ordering/CONTEXT.md) - 接收并跟踪订单。
- [账单](./docs/billing/CONTEXT.md) - 生成账单并处理付款。

## Relationships

- **订单 → 账单**：订单域发出 `OrderCompleted`，账单域消费它并生成账单。
```

CONTEXT 模板：

```markdown
# {Context 名称}

{一到两句话说明领域职责。}

## Language

**{规范术语}**：
{一到两句话定义它是什么。}
_Avoid_：{会造成歧义的同义词}
```

## QUESTIONS

从工作记录、用户反馈和验证证据识别重复出现的问题，合并同因问题, 事实变化时修订或删除过时问题。

```markdown
# {领域名}常见问题

## {反复出现的问题}？

- 适用条件与现象：{环境、版本或前置条件，如何识别}
- 原因：{有证据支持的根因}
- 解决方法：{可执行步骤或命令，以及不适用的边界}
- 验证：{如何判断恢复成功，已验证结果与日期}
- 来源：{相关 notes、代码、commit 或其他证据链接}
```

## ADR

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

```markdown
# {决策的简短标题}

{1–3 句话说明背景、决策与理由。}
```

下列内容必要时添加：

- `Status` frontmatter：`proposed | accepted | deprecated | superseded by ADR-NNNN`。
- `Considered Options`：被拒绝的备选值得未来读者记住。
- `Consequences`：存在不明显且重要的下游影响。

输出与现有 ADR 冲突时显式指出冲突及重新讨论的理由，不静默覆盖。
