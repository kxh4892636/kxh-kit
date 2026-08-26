# Standards smell baseline

这些 Fowler code smells 是 judgement heuristics，不是硬性违规。仓库明确认可的形态覆盖本 baseline；工具已机械强制的内容不进入人工 review。

- **Mysterious Name**：名称没有揭示实际职责。重命名；无法诚实命名通常表示设计仍含混。
- **Duplicated Code**：相同逻辑形态出现在多个变更位置。提取共同变化的形态。
- **Feature Envy**：method 使用另一个 object 的数据多于自身数据。把行为移向它依赖的数据。
- **Data Clumps**：同一组 fields 或 params 总是共同出现。用一个有领域含义的 type 表达它们。
- **Primitive Obsession**：primitive 或 string 承担了重要领域概念。提供能守住其不变量的 type。
- **Repeated Switches**：针对同一类型的条件 cascade 反复出现。集中 dispatch 或使用 polymorphism。
- **Shotgun Surgery**：一项逻辑变化迫使多个位置分散编辑。把共同变化收拢到一个 module。
- **Divergent Change**：一个 module 因多个不相关原因变化。按变化原因拆分职责。
- **Speculative Generality**：diff 为 spec 未要求的未来需求增加 abstraction 或 hook。收缩到当前真实需求。
- **Message Chains**：调用方暴露长 navigation chain。让最靠近数据的 module 隐藏 traversal。
- **Middle Man**：module 主要只是继续 delegate。把 interface 交给真正拥有行为的 module。
- **Refused Bequest**：subclass 或 implementer 忽略大部分继承契约。改用更诚实的 composition 或 interface。

每个 smell finding 必须引用具体 hunk，说明为何该 heuristic 在此处成立，并给出与仓库规则一致的改进方向。
