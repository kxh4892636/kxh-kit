---
name: codebase-design
description: 用于设计 deep modules 的共享 vocabulary. 当用户想要设计或改进 module 的 interface, 寻找 deepening 机会, 决定 seam 的位置, 提高代码的可测试性或 AI 可导航性, 或其他 skill 需要 deep-module vocabulary 时使用.
---

# Codebase Design

设计 **deep modules**: 将大量行为放在小型 interface 之后, 将其置于清晰的 seam, 并可通过该 interface 进行测试. 只要正在设计或重构代码, 就使用这套语言和这些原则. 目标是为调用方提供 leverage, 为维护者提供 locality, 并让所有人都能轻松测试.

## Glossary

精确使用以下术语, 不要用 "component", "service", "API" 或 "boundary" 替代. 重点就在于语言一致.

**Module** - 任何拥有 interface 和 implementation 的事物. 刻意不限定规模: 可以是函数, 类, 包, 或跨越多个层级的 slice. _Avoid_: unit, component, service.

**Interface** - 调用方正确使用 module 时必须知道的一切: 不仅包括类型签名, 还包括 invariants, 顺序约束, 错误模式, 必需配置和性能特征. _Avoid_: API, signature(过于狭窄, 它们只指类型层面的表面).

**Implementation** - module 内部的内容, 即它的代码主体. 与 **Adapter** 不同: 一个事物可以是拥有大型 implementation 的小型 adapter(Postgres repository), 也可以是拥有小型 implementation 的大型 adapter(in-memory fake). 讨论 seam 时使用 "adapter", 其他情况使用 "implementation".

**Depth** - interface 上的 leverage: 调用方(或测试)每学习一个单位的 interface, 可以使用多少行为. 当大量行为位于小型 interface 之后时, module 是 **deep**. 当 interface 几乎与 implementation 一样复杂时, module 是 **shallow**.

**Seam** _(Michael Feathers)_ - 无需在某个位置编辑代码, 便能改变该处行为的地方. 它是 module 的 interface 所在的_位置_. seam 应放在哪里是一项独立的设计决策, 与 seam 后面放什么不同. _Avoid_: boundary(与 DDD 的 bounded context 发生术语重载).

**Adapter** - 在 seam 上满足 interface 的具体事物. 它描述的是_角色_(填补哪个位置), 而不是实质(内部是什么).

**Leverage** - 调用方从 depth 中获得的收益: 每学习一个单位的 interface, 获得更多能力. 一份 implementation 可以回报 N 个调用点和 M 个测试.

**Locality** - 维护者从 depth 中获得的收益: 变更, bugs, 知识和验证集中在一处, 而不是分散到调用方中. 一处修复, 处处生效.

## Deep 与 shallow

**Deep module** = 小型 interface + 大量 implementation:

```
┌─────────────────────┐
│     小型 Interface  │  ← 少量 methods, 简单 params
├─────────────────────┤
│                     │
│  深层 Implementation│  ← 隐藏复杂逻辑
│                     │
└─────────────────────┘
```

**Shallow module** = 大型 interface + 少量 implementation(avoid):

```
┌─────────────────────────────────┐
│       大型 Interface            │  ← 大量 methods, 复杂 params
├─────────────────────────────────┤
│  薄层 Implementation            │  ← 仅透传
└─────────────────────────────────┘
```

设计 interface 时, 询问:

- 我能减少 methods 的数量吗?
- 我能简化 parameters 吗?
- 我能在内部隐藏更多复杂性吗?

## 原则

- **Depth is a property of the interface, not the implementation.** deep module 的内部可以由小型, 可 mock, 可替换的部分组成, 它们只是不属于 interface. module 既可以拥有 **internal seams**(implementation 私有, 由自身测试使用), 也可以在 interface 上拥有 **external seam**.
- **The deletion test.** 想象删除这个 module. 如果复杂性随之消失, 它只是 pass-through. 如果复杂性重新出现在 N 个调用方中, 它就有存在价值.
- **The interface is the test surface.** 调用方和测试穿过同一个 seam. 如果你想越过 interface 进行测试, module 的形态可能有误.
- **One adapter means a hypothetical seam. Two adapters means a real one.** 除非确实有某些事物会跨越 seam 发生变化, 否则不要引入 seam.

## 为 testability 进行设计

良好的 interfaces 让测试自然发生:

1. **接受 dependencies, 不要创建它们.**

   ```typescript
   // 易于测试
   function processOrder(order, paymentGateway) {}

   // 难以测试
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **返回结果, 不要产生 side effects.**

   ```typescript
   // 易于测试
   function calculateDiscount(cart): Discount {}

   // 难以测试
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Small surface area.** methods 越少 = 所需测试越少. params 越少 = 测试准备越简单.

## 关系

- 一个 **Module** 恰好拥有一个 **Interface**(它呈现给调用方和测试的表面).
- **Depth** 是 **Module** 的属性, 以其 **Interface** 为基准衡量.
- **Seam** 是 **Module** 的 **Interface** 所在的位置.
- **Adapter** 位于 **Seam** 上, 并满足 **Interface**.
- **Depth** 为调用方产生 **Leverage**, 为维护者产生 **Locality**.

## 拒绝的表述框架

- **Depth as ratio of implementation-lines to interface-lines**(Ousterhout): 会奖励填充 implementation. 我们改用 depth-as-leverage.
- **将 "Interface" 视为 TypeScript `interface` 关键字或类的 public methods**: 过于狭窄. 这里的 interface 包括调用方必须知道的每一项事实.
- **"Boundary"**: 与 DDD 的 bounded context 发生术语重载. 使用 **seam** 或 **interface**.

## 继续深入

- **根据 dependencies deepening 一组 modules** - 参见 [DEEPENING.md](DEEPENING.md): dependency categories, seam discipline 和 replace-don't-layer testing.
- **探索备选 interfaces** - 参见 [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md): 启动 parallel sub-agents, 用几种截然不同的方式设计 interface, 然后比较 depth, locality 和 seam placement.
