---
name: code-test
description: 在实现代码完成后编写和评估测试；当 feature、bug fix 或既有代码需要 unit/integration tests 或覆盖率时使用。
---

# Code Test

本 skill 承担 `implementation → tests` 中的 tests 阶段：先以已完成的生产代码和 spec 为对象，再编写能证明行为正确、能识别错误实现的测试。

探索 codebase 时，从 `CONTEXT-MAP.md` 定位所触及业务域并读取它们的 `CONTEXT.md`，使测试名称和 interface vocabulary 与项目的 domain language 一致，并遵守相关业务域的 ADRs。

## 流程

1. 使用 `/code-delivery` 执行基线中的质量门禁、public interfaces、critical paths 和 seams，负责其中的测试类门禁。
   - 直接调用本 skill 时，在写测试前写下受测 seams 并与用户确认。
   - interface 形态仍未确定时，使用 `/code-design` 的 module、interface、depth 和 seam vocabulary 先确定边界。
2. 在生产代码完成后编写测试。测试通过 public interfaces 验证 observable behavior，覆盖 spec 中的成功路径、失败路径和关键边界；expected values 来自 spec、worked example 或 known-good literal 等独立事实源。
3. 先运行受影响的单个测试文件。失败时根据 public contract 判断是测试还是实现错误；任何生产代码修正都会使本阶段重新从受影响测试开始。
4. 按仓库已有配置运行 coverage。
5. 记录测试命令、通过结果和 coverage report。只有下方门禁全部成立时，本 skill 才完成并进入 `/verifying`。

## 硬门禁

- 受影响测试和完整 test suite 均通过。
- **测试覆盖率 ≥ 80%。** 统计范围以仓库配置为事实源；未配置时至少包含本次修改的全部生产代码。报告同时给出 statements、branches、functions、lines 时，每一项都必须达到 80%；只给出单一总指标时，该指标必须达到 80%。
- 缺少 coverage tooling、报告或可复现命令时，结论是 `blocked`。不得通过缩小统计范围或编写无行为断言的测试来抬高指标；仓库定义的更严格门禁优先。

## 测试原则

良好的测试读起来像 specification。代码内部结构可以完全改变，只要 observable behavior 不变，测试就应继续通过。需要判断示例质量时读取 [tests.md](tests.md)；外部 seam 需要 mock 时读取 [mocking.md](mocking.md)。

**seam** 是执行测试的 public boundary：你可以在该 interface 上观察行为，而无需深入内部。测试只位于预先商定的 seams 上，使投入集中在 critical paths 和复杂逻辑，而不是内部结构或任意 edge cases。

## Anti-patterns

- **Implementation-coupled** - mock internal collaborators、测试 private methods，或通过 side channel 验证。识别信号：重构时行为没有变化，测试却失败。
- **Tautological** - assertion 使用与代码相同的方式重新计算 expected value，因此它由构造保证通过，永远无法与代码产生分歧。
- **Metric gaming** - 只执行代码却不验证行为、缩小统计范围或堆砌无行为断言的测试。识别信号：指标提高，但测试仍无法区分一个相关的错误实现。
