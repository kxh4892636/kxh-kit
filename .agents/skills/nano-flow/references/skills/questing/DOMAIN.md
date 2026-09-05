# 领域文档

仅在讨论需要改变领域模型或 ADR 时使用；读取领域语言供其他任务使用不触发维护。

1. **定域**：完整读取 领域布局与定位规则（`<nano-flow-skill-root-dir>/references/DOMAIN.md`），从 `CONTEXT-MAP.md` 定位所有相关业务域，读取对应 `CONTEXT.md` 与 ADR。归属仍需判断时，将带推荐答案的问题纳入 design tree；相关域与跨域关系均确定时完成。
2. **拷问**：以现有 glossary 与 ADR 约束设计。术语冲突时区分 canonical term 与新概念；关系与规则含糊时用 scenario 和 edge case 暴露边界；用代码核对用户对现状的描述，将矛盾纳入 frontier。环境事实由 agent 查明，trade-off 与领域选择按设计分支形成 draft 并由用户评价。
3. **维护语言**：已确认的新域、术语与跨域关系按 [Context 格式](#context-格式) 在成立的同一轮就地更新。每项内容只有一个权威位置，map 链接可解析，canonical term 与 `_Avoid_` 互不冲突时完成。
4. **记录 ADR**：架构形态、跨域集成、技术锁定、scope owner 或其他长期 trade-off，按 [ADR 格式](#adr-格式) 的资格门槛逐项判断；达标的决策只写入唯一 owner 一次，理由与已确认取舍一致时完成。
5. **校验**：代码与口头模型的矛盾已解决或明确记录、用户确认共同理解，且从工作区根执行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .` 通过时完成。

## Context 格式

### 业务域 CONTEXT.md

```md
# {Context 名称}

{一到两句话说明该 context 的领域职责。}

## Language

**{Canonical term}**:
{一到两句话定义它是什么}
_Avoid_: {会造成歧义的同义词}
```

- 一个概念选择一个 canonical term，把会造成歧义的同义词列入 `_Avoid_`。
- 定义说明概念是什么，保持一到两句话；规则与实现细节进入其他权威产物。
- 只收录当前业务域特有的语言；通用编程概念留在代码或工程文档。
- 自然形成多个概念簇时使用 subheading；单一 cohesive area 保持 flat list。

### CONTEXT-MAP.md

```md
# Context Map

## Contexts

- [Ordering](./docs/ordering/CONTEXT.md) - 接收并跟踪 customer orders。
- [Billing](./docs/billing/CONTEXT.md) - 生成 invoices 并处理 payments。

## Relationships

- **Ordering → Billing**: Ordering 发出 `OrderCompleted`；Billing 消费它并生成 invoice。
```

map 按领域布局维护索引与唯一跨域关系；新域同时创建 CONTEXT 与 map entry，链接可解析。没有跨域关系时省略 `Relationships`。

## ADR 格式

ADR 按领域布局的 owner、路径与编号规则创建；目录在首份 ADR 出现时创建，跨域决策由其他域链接引用。

### 资格门槛

一项决策同时满足以下条件才成为 ADR：

1. **Hard to reverse**：未来改变它有显著成本。
2. **Surprising without context**：只看实现无法理解为何这样选择。
3. **Real trade-off**：存在真实备选，并因明确理由选择其一。

常见候选包括架构形态、跨域集成、带 lock-in 的技术选择、owner 与 scope 边界、刻意偏离常规路径的方案，以及代码不可见的外部约束。库的普通选用、易逆转偏好和没有备选的显然选择不形成 ADR。

### 最小模板

```md
# {决策的简短标题}

{1-3 句话说明 context、决策与理由。}
```

ADR 可以只包含这个段落。下列内容仅在增加长期解释价值时添加：

- `Status` frontmatter：`proposed | accepted | deprecated | superseded by ADR-NNNN`。
- `Considered Options`：被拒绝的备选值得未来读者记住。
- `Consequences`：存在不明显且重要的下游影响。

创建前扫描 owner 域现有 ADR 的最大编号并递增 1。文件名、编号、owner、决策理由和引用均一致时完成。
