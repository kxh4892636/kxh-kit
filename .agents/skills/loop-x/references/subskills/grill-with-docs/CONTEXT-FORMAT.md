# Context Format

## 业务域 CONTEXT.md

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

### 规则

- **明确表达主张.** 如果同一个概念有多个词, 选择最好的一个, 并将其他词列在 `_Avoid_` 下.
- **保持定义紧凑.** 最多一到两句话. 定义它_是什么_, 而不是它做什么.
- **只包含此项目 context 特有的术语.** 即使项目大量使用通用编程概念(timeouts, error types, utility patterns), 它们也不属于这里. 添加术语前, 询问: 这是此 context 独有的概念, 还是通用编程概念? 只包含前者.
- **在 subheadings 下对术语分组.** 在自然形成 clusters 时对术语分组. 如果所有术语都属于同一个 cohesive area, 使用 flat list 即可.

## CONTEXT-MAP.md

repo 根目录的 `CONTEXT-MAP.md` 列出业务域, 它们的 glossary 位置, 以及彼此之间的关系:

```md
# Context Map

## Contexts

- [Ordering](./docs/ordering/CONTEXT.md) - 接收并跟踪 customer orders.
- [Billing](./docs/billing/CONTEXT.md) - 生成 invoices 并处理 payments.
- [Fulfillment](./docs/fulfillment/CONTEXT.md) - 管理仓库拣货和运输.

## Relationships

- **Ordering → Fulfillment**: Ordering 发出 `OrderPlaced` events. Fulfillment 消费它们并开始拣货.
- **Fulfillment → Billing**: Fulfillment 发出 `ShipmentDispatched` events. Billing 消费它们并生成 invoices.
- **Ordering ↔ Billing**: 共享 `CustomerId` 和 `Money` types.
```

map 只承担索引与关系, 不重复业务域 glossary. 没有跨域关系时省略 `Relationships`.

## 定位与创建

- 先读取 `CONTEXT-MAP.md`, 再推断当前 topic 与哪些业务域相关.
- 如果归属不清楚, 询问用户.
- 新业务域使用稳定、简短的 kebab-case `domain-name`; 同时创建 `docs/{domain-name}/CONTEXT.md` 和 map entry, 使链接始终可解析.
- 新的跨域关系只在 map 中记录一次.
