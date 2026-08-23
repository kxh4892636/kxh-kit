---
name: grill-with-docs
description: 拷问设计, 并将确认的术语与决策就地写入领域文档(CONTEXT.md, ADR). 当用户想打磨设计或想法且需要留下文档记录, 确定 domain terminology 或 ubiquitous language, 记录 architectural decision, 或其他 skill 需要维护 domain model 时使用.
---

运行一次 `/grilling` 会话, 并在会话期间主动构建并打磨项目的 domain model. 这是一项*主动*实践, 它会质疑术语, 构造 edge-case scenarios, 并在 glossary 和决策明确的那一刻将其写下.(仅仅为了 vocabulary 而*读取*领域文档并不属于本 skill, 那是任何 skill 都能做到的一行习惯. 本 skill 用于改变 domain model, 而不是只使用它.)

## 进入 Flow

作为顶层 skill 执行时, 在实质工作前进入 `/loop-x` 的运行态; 不要求用户先调用 `/loop-x`. 调用方传入 `plan` 或 `session` 时复用它们; 直接调用可同时省略, 此时主路径运行键为 `.` 且脚本生成 session. 保留命令返回的 `plan` 和 `session`:

```powershell
node .agents/skills/loop-x/script/flow.mjs enter-plan --skill /grill-with-docs
```

由 `/to-issues` 作为内部访谈调用时, 继承其 flow context 并作为 `/to-issues` 的内部行为运行, 不建立主路径, 不单独登记 receipt.

完成本 skill 的访谈与文档同步后, 顶层调用使用保留的上下文登记 `/grill-with-docs=completed` 和实际文档证据, 随后只执行脚本返回的 `next_skill`:

```powershell
node .agents/skills/loop-x/script/flow.mjs record-plan --plan <plan> --session <session> --skill /grill-with-docs --result completed --evidence <document-path>
```

## 定位业务域

先完整读取 `/loop-x` 根目录的 `DOMAIN.md`, 按其中的定位顺序和布局约束选择一个或多个业务域. 如果归属不清楚, 询问用户. 创建业务域、维护 map 和归属跨域决策时, 以该文件为单一事实源.

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
