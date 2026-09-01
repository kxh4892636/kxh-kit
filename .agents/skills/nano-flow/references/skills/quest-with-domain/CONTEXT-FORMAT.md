# Context 格式

本文件只定义领域 glossary 与 map 的文档形状；布局、归属与生命周期由 `<nano-flow-skill-root-dir>/references/DOMAIN.md` 负责。

## 业务域 CONTEXT.md

```md
# {Context 名称}

{一到两句话说明该 context 的领域职责。}

## Language

**Order**:
{一到两句话定义它是什么}
_Avoid_: Purchase, transaction

**Invoice**:
交付后发送给 customer 的付款请求。
_Avoid_: Bill, payment request
```

- 一个概念选择一个 canonical term，把会造成歧义的同义词列入 `_Avoid_`。
- 定义说明概念是什么，保持一到两句话；规则与实现细节进入其他权威产物。
- 只收录当前业务域特有的语言；通用编程概念留在代码或工程文档。
- 自然形成多个概念簇时使用 subheading；单一 cohesive area 保持 flat list。

## CONTEXT-MAP.md

```md
# Context Map

## Contexts

- [Ordering](./docs/ordering/CONTEXT.md) - 接收并跟踪 customer orders。
- [Billing](./docs/billing/CONTEXT.md) - 生成 invoices 并处理 payments。

## Relationships

- **Ordering → Billing**: Ordering 发出 `OrderCompleted`；Billing 消费它并生成 invoice。
```

map 只承担索引与跨域关系；每项关系只记录一次。没有跨域关系时省略 `Relationships`。

新业务域使用稳定、简短的 kebab-case `domain-name`，同时创建 `docs/{domain-name}/CONTEXT.md` 和 map entry，使每条链接可解析。
