---
name: code-test
description: 实现完成后，需要编写或评估 unit/integration tests、检查覆盖率时使用。
---

# Code Test

负责 `implementation → tests` 的测试阶段，以完成的生产代码和 spec 为输入，证明行为并识别错误实现。探索前按 领域定位规则（`<nano-flow-skill-root-dir>/references/DOMAIN.md`） 读取相关 `CONTEXT.md` 与 ADR，使测试命名和 interface vocabulary 对齐领域语言。

## 流程

1. 从 `/code-delivery` 基线取得质量门禁、public interfaces、critical paths 与 seams，承担测试类门禁。直接调用时，写测试前列出受测 seams 并与用户确认；interface 未定时使用 `/code-design` 确定边界。
2. 通过 public interfaces 测试 observable behavior，覆盖 spec 的成功、失败与关键边界。expected values 来自 spec、worked example 或 known-good literal 等独立事实源。
3. 先运行受影响的单个测试文件，按 public contract 判断失败来自测试还是实现；生产代码修正后从受影响测试重新开始。
4. 按仓库配置运行 coverage，记录命令、通过结果与报告。下方硬门禁全部成立时测试阶段完成；由调用者进入 `/verifying`，独立调用时继续执行该 skill。

## 硬门禁

- 受影响测试与完整 test suite 均通过。
- **覆盖率 ≥ 80%**：范围以仓库配置为准；未配置时至少包含本次修改的全部生产代码。报告有 statements、branches、functions、lines 时每项均达标；只有总指标时该项达标。仓库更严格门禁优先。
- 缺少 coverage tooling、报告或可复现命令时为 `blocked`；统计范围与行为断言保持完整，不能靠缩小范围或无断言测试抬高指标。

## 测试原则

`/code-design` 拥有 seam vocabulary；测试通过约定的 public interface 观察行为，替换依赖的 internal seam 保持在实现内。投入集中于预先商定的 seams、critical paths 与复杂逻辑，避免任意边界或内部结构。

测试应读起来像 specification，并在行为不变的内部重构后继续通过。判断示例质量时读 [tests.md](tests.md)；外部 seam 需要 mock 时读 [mocking.md](mocking.md)。

| Anti-pattern               | 识别信号                                                                      |
| -------------------------- | ----------------------------------------------------------------------------- |
| **Implementation-coupled** | mock 内部协作者、测 private methods 或 side channel；行为未变而重构使测试失败 |
| **Tautological**           | 用实现的同一算法计算 expected value，断言由构造保证通过                       |
| **Metric gaming**          | 仅执行代码、缩小范围或堆无行为断言；指标提高却无法识别相关错误实现            |
