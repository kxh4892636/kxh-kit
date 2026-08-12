---
name: domain-modeling
description: 构建并打磨项目的 domain model. 当用户想确定 domain terminology 或 ubiquitous language, 记录 architectural decision, 或其他 skill 需要维护 domain model 时使用.
---

# Domain Modeling

在设计过程中主动构建并打磨项目的 domain model. 这是一项_主动_实践, 它会质疑术语, 构造 edge-case scenarios, 并在 glossary 和决策明确的那一刻将其写下.(仅仅为了 vocabulary 而_读取_ `CONTEXT.md` 并不属于本 skill, 那是任何 skill 都能做到的一行习惯. 本 skill 用于改变 domain model, 而不是只使用它.)

## 文件结构

大多数 repos 只有一个 context:

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-event-sourced-orders.md
│   │   └── 0002-postgres-for-write-model.md
│   └── workflows/
│       └── 0001-ordering-workflow.md
└── src/
```

如果根目录存在 `CONTEXT-MAP.md`, 则该 repo 有多个 contexts. map 指向每个 context 所在的位置:

```
/
├── CONTEXT-MAP.md
├── docs/
│   ├── adr/                          ← 系统级决策
│   └── workflows/                    ← 系统级重复循环
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/
│   │       ├── adr/                  ← context 专属决策
│   │       └── workflows/            ← context 专属重复循环
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/
│           ├── adr/
│           └── workflows/
```

惰性创建文件, 仅在有内容可写时创建. 如果不存在 `CONTEXT.md`, 在第一个术语确定时创建. 如果不存在 `docs/adr/`, 在需要第一个 ADR 时创建. 如果不存在 `docs/workflows/`, 在明确第一个 recurring loop 时创建.

## 会话期间

### 用 glossary 质疑

当用户使用的术语与 `CONTEXT.md` 中的现有语言冲突时, 立即指出. "你的 glossary 将 'cancellation' 定义为 X, 但你似乎表达的是 Y. 到底是哪一个?"

### 打磨模糊语言

当用户使用含糊或 overloaded terms 时, 提出精确的 canonical term. "你说的是 'account'. 你指的是 Customer 还是 User? 它们是不同的事物."

### 讨论具体 scenarios

讨论 domain relationships 时, 使用具体 scenarios 对它们进行 stress-test. 构造能够探测 edge cases 的 scenarios, 迫使用户精确说明概念之间的边界.

### 与代码交叉核对

当用户说明某项事物如何运行时, 检查代码是否一致. 如果发现矛盾, 将其指出: "你的代码会取消整个 Orders, 但你刚才说可以部分取消. 哪个才是正确的?"

### 就地更新 CONTEXT.md

确定术语后, 当场更新 `CONTEXT.md`. 不要批量处理, 在它们发生时立即记录. 使用 [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) 中的格式.

`CONTEXT.md` 应完全不包含 implementation details. 不要将 `CONTEXT.md` 当作 spec, scratch pad 或 implementation decisions 的存储库. 它只是 glossary, 除此之外什么都不是.

### 就地维护 workflows

明确 recurring loop 后, 当场创建或更新它的 workflow. workflow 记录 loop 如何运行: 它的 trigger, 输入, 前置条件, delegation boundary, completion boundary 和输出. 使用 glossary 中的语言, 并遵守现有 ADRs.

让每项关注点都待在自己的归属地: domain meaning 属于 `CONTEXT.md`, hard-to-reverse architectural decisions 属于 ADRs, recurring execution 属于 `docs/workflows/`.

### 谨慎提议 ADRs

只有同时满足以下三个条件时, 才提议创建 ADR:

1. **Hard to reverse** - 日后改变决定的成本不可忽略.
2. **Surprising without context** - 未来的读者会疑惑: "为什么要这样做?"
3. **The result of a real trade-off** - 确实存在备选方案, 并且你出于具体原因选择了其中一个.

缺少其中任何一个条件时, 跳过 ADR. 使用 [ADR-FORMAT.md](./ADR-FORMAT.md) 中的格式.
