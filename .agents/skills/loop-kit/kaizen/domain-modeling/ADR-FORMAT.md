# ADR Format

ADRs 位于 `docs/adr/`, 并使用连续编号: `0001-slug.md`, `0002-slug.md` 等.

惰性创建 `docs/adr/` 目录, 仅在需要第一个 ADR 时创建.

## 模板

```md
# {决策的简短标题}

{1-3 句话: context 是什么, 我们做了什么决策, 原因是什么.}
```

仅此而已. ADR 可以只有一个段落. 它的价值在于记录_已经_做出决策以及_为什么_这样决定, 而不在于填满各个章节.

## 可选章节

只有在确实能增加价值时才包含这些章节. 大多数 ADRs 不需要它们.

- **Status** frontmatter(`proposed | accepted | deprecated | superseded by ADR-NNNN`) - 在重新审视决策时有用.
- **Considered Options** - 仅在被拒绝的备选方案值得记住时使用.
- **Consequences** - 仅在需要指出不明显的下游影响时使用.

## 编号

扫描 `docs/adr/` 中已有的最大编号, 并递增 1.

## 何时提议 ADR

必须同时满足以下三个条件:

1. **Hard to reverse** - 日后改变决定的成本不可忽略.
2. **Surprising without context** - 未来的读者看到代码时会疑惑: "他们到底为什么要这样做?"
3. **The result of a real trade-off** - 确实存在备选方案, 并且你出于具体原因选择了其中一个.

如果决策易于逆转, 跳过它, 因为你只需逆转它. 如果它并不令人意外, 就不会有人追问原因. 如果根本不存在真正的备选方案, 除了"我们做了显而易见的事"之外就没有内容值得记录.

### 符合条件的内容

- **Architectural shape.** "我们使用 monorepo." "write model 使用 event sourcing, read model 投影到 Postgres."
- **Contexts 之间的 integration patterns.** "Ordering 与 Billing 通过 domain events 通信, 而不是 synchronous HTTP."
- **带来 lock-in 的技术选择.** Database, message bus, auth provider, deployment target. 不是每个 library 都需要记录, 只记录需要一个季度才能替换的选择.
- **Boundary 和 scope decisions.** "Customer 数据归 Customer context 所有. 其他 contexts 只能通过 ID 引用它." 明确的 no-s 与 yes-s 同样有价值.
- **刻意偏离明显路径的选择.** "我们使用 manual SQL 而不是 ORM, 因为 X." 任何合理读者会作出相反假设的内容都属于此类. 它们可以阻止下一位 engineer 去"修复"某项刻意为之的选择.
- **代码中不可见的 constraints.** "由于 compliance requirements, 我们不能使用 AWS." "由于 partner API contract, 响应时间必须低于 200ms."
- **拒绝原因并不明显的 rejected alternatives.** 如果你考虑过 GraphQL, 却出于微妙原因选择 REST, 记录下来. 否则六个月后还会有人再次建议 GraphQL.
