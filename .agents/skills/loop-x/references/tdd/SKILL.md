---
name: tdd
description: Test-driven development. 当用户想以 test-first 方式构建 features 或修复 bugs, 提到 "red-green-refactor", 或需要 integration tests 时使用.
---

# Test-Driven Development

TDD 是 red → green loop. 本 skill 是让该 loop 产出值得保留的测试的 reference: 什么是良好的测试, 测试应放在哪里, anti-patterns, 以及 loop 的规则. 每个章节都适用于每次循环, 在 loop 开始前和进行期间查阅, 而不是事后查阅.

探索 codebase 时, 从 `CONTEXT-MAP.md` 定位所触及业务域并读取它们的 `CONTEXT.md`, 使测试名称和 interface vocabulary 与项目的 domain language 一致, 并遵守相关业务域的 ADRs.

## 什么是良好的 test

测试通过 public interfaces 验证行为, 而不是 implementation details. 代码可以完全改变, 测试不应该随之改变. 良好的测试读起来像 specification. "用户可以使用有效 cart 结账"会准确说明存在什么能力. 它不关心内部结构, 因此能经受重构.

示例参见 [tests.md](tests.md), mocking 指南参见 [mocking.md](mocking.md).

## Seams - tests 应放在哪里

**seam** 是执行测试的 public boundary: 你可以在该 interface 上观察行为, 而无需深入内部. 测试位于 seams 上, 绝不针对内部结构.

**Test only at pre-agreed seams.** 编写任何测试前, 写下受测 seams 并与用户确认. 不在未经确认的 seam 上编写测试. 你无法测试一切. 预先商定 seams, 才能让测试投入落在 critical paths 和复杂逻辑上, 而不是每个 edge case 上.

询问: "public interface 是什么, 我们应该测试哪些 seams?"

如果该 interface 的形态本身仍是问题, 例如 module 应该多 deep, seam 应放在哪里, interface 应暴露什么, 使用 `/codebase-design` skill 获取 vocabulary. 它是 module, interface, depth, seam, adapter, leverage 和 locality 这些术语的共享来源, 是需要查阅的 reference, 而不是需要运行的会话.

## Anti-patterns

- **Implementation-coupled** - mock internal collaborators, 测试 private methods, 或通过 side channel 验证(查询 database, 而不是使用 interface). 识别信号: 重构时行为没有变化, 测试却失败.
- **Tautological** - assertion 使用与代码相同的方式重新计算 expected value(`expect(add(a, b)).toBe(a + b)`, 以相同方式手动导出的 snapshot, 断言 constant 等于自身), 因此它由构造保证通过, 永远无法与代码产生分歧. Expected values 必须来自独立的 source of truth, 例如 known-good literal, worked example 或 spec.
- **Horizontal slicing** - 先编写所有测试, 再编写所有 implementation. 批量测试验证_想象中的_行为: 你测试的是事物的_形态_, 而不是 user-facing behavior. 测试会对真实变更失去敏感性, 你也会在理解 implementation 前便对测试结构作出承诺. 改用 **vertical slices**, 一次测试 → 一次 implementation → 重复. 每个测试都是会响应上一个循环所带来认识的 **tracer bullet**.

## Loop 规则

- **Red before green.** 先编写 failing test, 然后只编写足以使其通过的代码. 不要预判未来测试, 也不要添加 speculative features.
- **One slice at a time.** 每个循环只处理一个 seam, 一个测试, 一个 minimal implementation.
- **Refactoring is not part of the loop.** Refactoring 属于 review stage(参见 `code-review` skill), 不属于 red → green implementation cycle.
