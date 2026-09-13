# 设计

根据 **design tree**，agent 自动回答每轮问题形成草案；

## 1. 自动回答

基于 `## 审阅模板` 在工作区根创建或续写 `.flow/quest/YYYY-MM-DD-中文工作名.md`。

## 2. 统一评价

评价全部问题，并在「补充说明」补充遗漏。

- 空白「修改意见」表示同意 agent 选择。
- 「修改意见」或「补充说明」存在未处理反馈时，处理反馈并更新 design tree 和 frontier；保留反馈并标明处理结论。

## 3. 领域变更

反馈已处理、frontier 为空且按模式完成确认后，如果存在领域变更，遵循 `## domain`。

## 审阅模板

```markdown
# {中文工作名}

## 第 {round} 轮

### ❓ Q{question} — {标题}

- 问题：{问题与互斥选择}
- 前置问题：{Q 编号或无}
- 下游边界：{该答案会改变什么}
- 推荐答案及其理由：{选择}
- 修改意见：

<!-- 每题重复以上结构，编号在整个 quest 内递增；按轮追加，补充说明始终位于末尾。 -->

## 补充说明

<!-- 填写所有问题均未涉及的用户补充说明；没有则留空。 -->
```

## domain

1. **定域**：基于 `<nano-flow-skill-root-dir>/references/DOMAIN.md`, 读取修改业务域的 CONTEXT 与 ADR。
2. **维护 CONTEXT 和 ADR**：根据审阅文件, `### context 格式` 和 `### ADR 格式`, 进行创建/更新/删除;
3. **校验**: 工作区根执行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .` 进行领域文档校验;

### context 格式

- CONTEXT-MAP.md

```md
# Context Map

## Contexts

- [Ordering](./docs/ordering/CONTEXT.md) - 接收并跟踪 customer orders。
- [Billing](./docs/billing/CONTEXT.md) - 生成 invoices 并处理 payments。

## Relationships

- **Ordering → Billing**: Ordering 发出 `OrderCompleted`；Billing 消费它并生成 invoice。
```

- Context.md

```md
# {Context 名称}

{一到两句话说明该 context 的领域职责。}

## Language

**{Canonical term}**:
{一到两句话定义它是什么}
_Avoid_: {会造成歧义的同义词}
```

### ADR 格式

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

最小 ADR 模板:

```md
# {决策的简短标题}

{1-3 句话说明 context、决策与理由。}
```

下列内容必要时添加：

- `Status` frontmatter：`proposed | accepted | deprecated | superseded by ADR-NNNN`。
- `Considered Options`：被拒绝的备选值得未来读者记住。
- `Consequences`：存在不明显且重要的下游影响。

输出与现有 ADR 冲突时显式指出冲突及重新讨论的理由，不静默覆盖。
