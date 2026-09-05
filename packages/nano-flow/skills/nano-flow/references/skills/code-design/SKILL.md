---
name: code-design
description: 设计 deep modules、收窄 interface、集中复杂性，或选择依赖策略、adapter 与模块边界方案时使用。
---

# Code Design

**Deep module** 让调用方学习较小的 interface 获得较多行为，让维护者把变化、知识与验证集中在一处。

## Vocabulary

命名、图示与方案比较统一使用：

| 术语               | 定义                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Module**         | 拥有 interface 与 implementation 的函数、类、包或 vertical slice；避免以 component、service、unit 作同义词   |
| **Interface**      | 正确使用 module 必须知道的类型、invariants、顺序、错误、配置与重要性能约束，超出 signature 或 TS `interface` |
| **Implementation** | interface 后隐藏的行为与数据                                                                                 |
| **Depth**          | 每学习一个单位 interface 可获得多少行为；interface 接近 implementation 复杂度时为 shallow                    |
| **Seam**           | 无须修改调用点即可替换行为的位置，由 interface 定义；避免用 boundary 作同义词而与 bounded context 混淆       |
| **Adapter**        | 在 seam 上满足 interface 的具体实现                                                                          |
| **Leverage**       | 调用方从 depth 获得的复用收益                                                                                |
| **Locality**       | 同一变化、bug 与验证集中一处的维护收益                                                                       |

## Design lens

- **Depth 属于 interface**：以调用方理解成本下降衡量，implementation 行数增加不代表 depth。
- **Deletion test**：移除后复杂性在多个调用方重现，说明提供 locality；仅少一层转发则是 shallow middle man。
- **Interface is the test surface**：调用方与测试通过约定 interface 观察行为；验证需越过它时，重审 interface 或 seam placement。
- **Hide policy, expose intent**：module 隐藏顺序、重试、状态转换和依赖编排，调用方表达结果。

逐个列出候选 module 的 interface、隐藏复杂性、adapters、可观察结果及变化集中处。无法指出 leverage 或 locality 时保持 inline 或继续重构。

## Testability

dependencies 从 policy owner 外部注入，内部协作方式由 module 拥有。优先暴露可观察结果；新 methods 与 parameters 只表达真实 use cases 和 invariants。

每个新增或改变的 seam 都有真实 variation、测试通过约定 interface 观察行为、实现细节未泄漏给调用方时，设计检查完成。

## Conditional references

- shallow modules 因 dependencies 无法直接合并时，读 [DEEPENING.md](DEEPENING.md)，选择依赖类别、seam、adapter 和替换式测试策略。
- 关键 interface 有多个合理形态且显著影响 depth 或 locality 时，读 [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md)，并行生成备选后比较。
