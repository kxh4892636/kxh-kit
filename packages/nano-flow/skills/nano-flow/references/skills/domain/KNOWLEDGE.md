# 领域知识

## 定域与共享

- CONTEXT-MAP 只索引业务域及其关系，跨域关系只定义一次；新增域时同时创建 CONTEXT.md、QUESTIONS.md 并加入 map。
- common 承载多域共同贡献的术语、常见问题与 ADR；跨域内容只选择一个 owner，其他域用链接引用。
- CONTEXT 与 QUESTIONS 均为必备文件；map 以 CONTEXT 为业务域入口。

## CONTEXT

CONTEXT 只承载域职责与 glossary。从用户输入、代码与已确认决策提取稳定术语，就地修订、去重或删除过时定义；工作过程与临时假设留在 Plan。

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

从工作记录、用户反馈与验证证据识别重复问题，合并同因问题，记录适用条件和已验证的解决方法；事实变化时修订或删除过时内容。未经验证的猜想留在 notes；尚无符合条件的问题时写明「暂无已验证的重复问题」。

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
