---
name: grill-with-docs
description: 拷问设计, 并将确认的术语与决策就地写入领域文档(CONTEXT.md, ADR). 当用户想打磨设计或想法且需要留下文档记录, 确定 domain terminology 或 ubiquitous language, 记录 architectural decision, 或其他 skill 需要维护 domain model 时使用.
---

运行一次 `/grilling` 会话, 并在会话期间主动构建并打磨项目的 domain model. 这是一项*主动*实践, 它会质疑术语, 构造 edge-case scenarios, 并在 glossary 和决策明确的那一刻将其写下.(仅仅为了 vocabulary 而*读取*领域文档并不属于本 skill, 那是任何 skill 都能做到的一行习惯. 本 skill 用于改变 domain model, 而不是只使用它.)

## 文件结构

repos 默认采用 multi-context 布局. 根目录的 `CONTEXT-MAP.md` 索引业务域及其关系; 每个业务域在 `docs/{domain-name}/` 内封装自己的 glossary 和 ADRs:

```text
/
├── CONTEXT-MAP.md
├── docs/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   ├── adr/
│   │   │   └── 0001-采用事件溯源订单.md
│   │   └── plans/
│   │       └── active/
│   │           └── 0001-支持订单取消/
│   │               ├── spec.md
│   │               └── 01-取消接口.md
│   └── billing/
│       ├── CONTEXT.md
│       ├── adr/
│       └── plans/
└── src/
```

先读取 `CONTEXT-MAP.md`, 再根据当前 topic 定位一个或多个业务域. 如果归属不清楚, 询问用户. `domain-name` 使用稳定、简短的 kebab-case 名称.

创建新业务域时, 同时创建 `docs/{domain-name}/CONTEXT.md` 并加入 `CONTEXT-MAP.md`. `adr/` 惰性创建, 只在有 ADR 时创建. 跨业务域关系只在 map 中定义一次; 跨域决策归入拥有它的业务域, 其他业务域通过链接引用.

## 会话期间

### 用 glossary 质疑

当用户使用的术语与相关业务域 `CONTEXT.md` 中的现有语言冲突时, 立即指出. "你的 glossary 将 'cancellation' 定义为 X, 但你似乎表达的是 Y. 到底是哪一个?"

### 打磨模糊语言

当用户使用含糊或 overloaded terms 时, 提出精确的 canonical term. "你说的是 'account'. 你指的是 Customer 还是 User? 它们是不同的事物."

### 讨论具体 scenarios

讨论 domain relationships 时, 使用具体 scenarios 对它们进行 stress-test. 构造能够探测 edge cases 的 scenarios, 迫使用户精确说明概念之间的边界.

### 与代码交叉核对

当用户说明某项事物如何运行时, 检查代码是否一致. 如果发现矛盾, 将其指出: "你的代码会取消整个 Orders, 但你刚才说可以部分取消. 哪个才是正确的?"

### 就地维护 CONTEXT-MAP.md

确定新业务域或跨业务域关系后, 当场更新 `CONTEXT-MAP.md`. map 只记录业务域的名称, `CONTEXT.md` 链接, 简介和关系; domain terms 仍归各业务域的 glossary 所有. 使用 [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) 中的格式.

### 就地更新业务域 CONTEXT.md

确定术语后, 当场更新 `docs/{domain-name}/CONTEXT.md`. 不要批量处理, 在它们发生时立即记录. 使用 [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md) 中的格式.

`CONTEXT.md` 应完全不包含 implementation details. 不要将 `CONTEXT.md` 当作 spec, scratch pad 或 implementation decisions 的存储库. 它只是 glossary, 除此之外什么都不是.

### 谨慎提议 ADRs

只有同时满足以下三个条件时, 才提议创建 ADR:

1. **Hard to reverse** - 日后改变决定的成本不可忽略.
2. **Surprising without context** - 未来的读者会疑惑: "为什么要这样做?"
3. **The result of a real trade-off** - 确实存在备选方案, 并且你出于具体原因选择了其中一个.

缺少其中任何一个条件时, 跳过 ADR. 使用 [ADR-FORMAT.md](./ADR-FORMAT.md) 中的格式.
