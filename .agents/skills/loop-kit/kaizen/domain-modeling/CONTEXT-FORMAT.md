# CONTEXT.md Format

## 结构

```md
# {Context 名称}

{用一到两句话说明这个 context 是什么, 以及它为何存在.}

## Language

**Order**:
{用一到两句话描述该 term}
_Avoid_: Purchase, transaction

**Invoice**:
交付后发送给 customer 的付款请求.
_Avoid_: Bill, payment request

**Customer**:
下达 orders 的个人或组织.
_Avoid_: Client, buyer, account
```

## 规则

- **明确表达主张.** 如果同一个概念有多个词, 选择最好的一个, 并将其他词列在 `_Avoid_` 下.
- **保持定义紧凑.** 最多一到两句话. 定义它_是什么_, 而不是它做什么.
- **只包含此项目 context 特有的术语.** 即使项目大量使用通用编程概念(timeouts, error types, utility patterns), 它们也不属于这里. 添加术语前, 询问: 这是此 context 独有的概念, 还是通用编程概念? 只包含前者.
- **在 subheadings 下对术语分组.** 在自然形成 clusters 时对术语分组. 如果所有术语都属于同一个 cohesive area, 使用 flat list 即可.

## Single-context 与 multi-context repos

**Single context(大多数 repos):** repo 根目录下有一个 `CONTEXT.md`.

**Multiple contexts:** repo 根目录下的 `CONTEXT-MAP.md` 列出 contexts, 它们所在的位置, 以及彼此之间的关系:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) - 接收并跟踪 customer orders.
- [Billing](./src/billing/CONTEXT.md) - 生成 invoices 并处理 payments.
- [Fulfillment](./src/fulfillment/CONTEXT.md) - 管理仓库拣货和运输.

## Relationships

- **Ordering → Fulfillment**: Ordering 发出 `OrderPlaced` events. Fulfillment 消费它们并开始拣货.
- **Fulfillment → Billing**: Fulfillment 发出 `ShipmentDispatched` events. Billing 消费它们并生成 invoices.
- **Ordering ↔ Billing**: 共享 `CustomerId` 和 `Money` types.
```

skill 推断适用的结构:

- 如果存在 `CONTEXT-MAP.md`, 读取它以查找 contexts.
- 如果只存在根目录 `CONTEXT.md`, 使用 single context.
- 如果两者都不存在, 在确定第一个 term 时惰性创建根目录 `CONTEXT.md`.

存在 multiple contexts 时, 推断当前 topic 与哪个 context 相关. 如果不清楚, 询问用户.
