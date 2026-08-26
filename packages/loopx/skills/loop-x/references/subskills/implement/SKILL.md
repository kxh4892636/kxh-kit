---
name: implement
description: "根据 spec 或 issues 实现工作."
---

实现用户在 spec 或 issues 中描述的工作.

携带 flow context 进入时, 完整读取 [`FLOW.md`](../../FLOW.md) 并按共享协议推进和登记; 直接调用本 skill 且不属于 Flow 时忽略该协议.

开始前使用 `/dev-gate`. 只有其结论为 `ready` 时才进入实现; 以确认后的执行契约推进, 以确认后的质量门禁作为 `/code-test` 和 `/verifying` 输入. 基线发生实质漂移时, 返回 `/dev-gate` 更新并重新确认.

严格按以下顺序完成一次交付：

1. **写代码**：完整读取并遵守 `/code-spec`，在确认的执行契约和范围内完成生产代码；此阶段结束前不编写本次变更的新测试。
2. **写测试**：使用 `/code-test` 在预先商定的 seams 上编写或更新测试。只有测试全部通过且测试覆盖率 ≥ 95% 时进入下一步。变异测试仅在工作区已有入口且用户明确确认本次执行时运行，运行后的分数必须 ≥ 90%；其余情况记录 skip，不阻断交付。
3. **Verify**：使用 `/verifying` 复用测试证据并执行质量门禁中尚未取得可信证据的部分，结论必须为 `passed`。
4. **Code review**：使用 `/code-review` 沿 Standards 和 Spec 两轴审查未提交变更；阻断发现必须修复或由用户明确接受。
5. **Commit**：前四步证据仍适用于当前 diff 时，将工作 commit 到当前 branch。

任何生产代码修正都会使其后的测试、verify 和 review 证据失效，从 `/code-test` 重新推进；review 后发生修改时同样重跑受影响的后续门禁。携带 flow context 时，完成 code、test、verify 和 review 后才从 `/implement` 返回并执行 `commit` action.

遇到 block 卡点, 首先在 [工作流索引](../../workflows/README.md) 和对应业务域 workflow 中寻找可能的解决方法.
