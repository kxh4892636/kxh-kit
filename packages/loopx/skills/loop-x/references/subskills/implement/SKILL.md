---
name: implement
description: 按已确认的 spec 或 issue 交付代码，并串联测试、验证、双轴审查与获授权的提交；当 `/dev-gate` 已给出 `ready` 时使用。
---

# Implement

以 `/dev-gate` 确认的执行契约为边界，以同一基线中的质量门禁为证据要求。结论尚非 `ready` 时先运行 `/dev-gate`。

携带 flow context 时，先完整读取 [`FLOW.md`](../../FLOW.md)，登记 `/implement=started`，保存脚本返回的 `commit` action；内部门禁完成前不执行该 action。直接调用本 skill 时沿用同一交付链，但只执行用户授权的状态变更。

## 交付链

1. **生产代码**：完整读取并逐项应用 `/code-spec`，在确认范围内完成生产代码；保留既有测试，把本次新增或更新测试留给下一步。范围内生产行为完成且 diff 未混入范围外工作时完成。
2. **测试**：完整执行 `/code-test`，由它选择测试、coverage 与 mutation 门禁。其结论满足自身全部完成标准且证据对应当前 diff 时完成。
3. **验证**：完整执行 `/verifying`，复用仍可信的测试证据并补齐其余质量门禁。结论为 `passed` 且没有超出证据范围的交付主张时完成。
4. **审查**：以执行契约中的 fixed point 运行 `/code-review`。Standards 与 Spec 两轴的阻断发现均已修复，或由用户逐项明确接受时完成。
5. **提交**：再次核对前四步证据仍适用于当前 diff。Flow 中只执行先前返回且已由执行契约确认的 `commit` action；直接调用时只在用户要求提交后 commit。提交成功并以 commit ID 登记证据时完成。

生产代码变化会使其后的测试、验证和审查证据失效；从最早受影响的门禁重新取得证据。基线漂移则返回 `/dev-gate`，更新权威入口并重新确认。

遇到真实障碍时，读取 [`workflows/README.md`](../../workflows/README.md) 和相关业务域已有 workflow，寻找已记录的恢复路径；再记录现有证据、缺失条件和恢复入口。携带 issue context 时按 [`FLOW.md`](../../FLOW.md) 形成 blocked 结果；其余情况向用户交付同样可判定的阻塞说明。
