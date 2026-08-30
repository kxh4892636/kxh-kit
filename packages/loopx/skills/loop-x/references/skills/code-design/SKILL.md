---
name: code-design
description: 设计 deep modules 与可测试 seams；当任务需要收窄 interface 并集中复杂性、分类依赖、选择 adapter 或比较模块边界方案时使用。
---

# Code Design

目标是 **deep module**：调用方学习较小的 interface，获得较多行为；维护者把变化、知识与验证集中在一处。

## Vocabulary

在设计与评审中使用同一组词：

- **Module**：任何同时拥有 interface 与 implementation 的事物，可以是函数、类、包或 vertical slice。_Avoid_: component、service、unit。
- **Interface**：调用方正确使用 module 必须知道的全部事实，包括类型、invariants、顺序、错误、配置与重要性能约束。_Avoid_: 只把 signature 或 TypeScript `interface` 当作全部 interface。
- **Implementation**：module 在 interface 后隐藏的行为与数据。
- **Depth**：interface 的 leverage；每学习一个单位 interface 可使用多少行为。interface 接近 implementation 复杂度时 module 是 shallow。
- **Seam**：无需修改调用点即可替换行为的位置，是 module interface 所在处。_Avoid_: boundary，避免与 bounded context 混淆。
- **Adapter**：在 seam 上满足 interface 的具体实现角色。
- **Leverage**：调用方从 depth 获得的复用收益。
- **Locality**：维护者把同一变化、bug 与验证保持在一处的收益。

一个概念只有一个术语；命名、图示和方案比较均使用以上 vocabulary。

## Design lens

- **Depth 属于 interface**：更多 implementation lines 不会自动产生 depth；只有调用方需要理解的复杂度下降才会。
- **Deletion test**：移除 module 后，若复杂性在多个调用方重新出现，它提供了 locality；若只少一层转发，它是 shallow middle man。
- **Interface is the test surface**：调用方与测试穿过同一个 seam 观察行为。需要越过 interface 才能验证时，重新检查 interface 或 seam placement。
- **Hide policy, expose intent**：把顺序、重试、状态转换和依赖编排藏在 module 内，让调用方表达要得到的结果。

评估每个候选 module：列出调用方必须知道的 interface、被隐藏的 complexity、预期 adapters、可观察结果，以及变化会集中在哪里。无法指出 leverage 或 locality 的候选保持 inline 或继续重构。

## Testability

- dependencies 从拥有 policy 的 module 外部注入；module 自己拥有其内部协作方式。
- 优先返回或暴露可观察结果，使测试通过 interface 判断行为。
- 新 interface 的 methods 与 parameters 只表达真实 use cases 和 invariants。

每个新增或改变的 seam 都有真实 variation，每个测试都通过约定 interface 观察行为，且 implementation 细节没有泄漏到调用方时，设计检查完成。

## Conditional references

- 一组 shallow modules 因 dependencies 无法直接合并时，读取 [`DEEPENING.md`](DEEPENING.md)，按依赖类别选择 seam、adapter 与替换式测试策略。
- 关键 interface 存在多个合理形态且选择会显著影响 depth 或 locality 时，读取 [`DESIGN-IT-TWICE.md`](DESIGN-IT-TWICE.md)，并行生成不同约束下的设计再比较。
