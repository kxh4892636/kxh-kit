---
name: code-delivery
description: 按已确认的 spec 或 issue 交付代码；当 `/dev-gate` 已给出 `ready` 时使用。
---

# Code Delivery

以 `/dev-gate` 的 `ready` 基线为准，遵守执行契约与质量门禁；前置缺失或基线实质漂移时，返回该 gate 更新权威输入并重新确认。

1. **实现**：遵循 `/code-spec`，完成全部交付物。
2. **测试**：执行 `/code-test`，补齐所需测试并通过测试类门禁。
3. **验收**：执行 `/verifying`，取得当前 diff 的 `passed` 结论。
4. **审查**：执行 `/code-review`，处理双轴发现至无阻塞项；修复后重跑受影响的测试、验收与审查。
5. **提交**：按执行契约与已有授权提交通过门禁的变更，报告 commit；缺少授权时先请求。
