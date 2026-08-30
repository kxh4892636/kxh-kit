---
name: code-delivery
description: 按已确认的 spec 或 issue 交付代码；当 `/dev-gate` 已给出 `ready` 时使用。
---

# Code Delivery

以 `/dev-gate` 确认的执行契约为边界，以同一基线中的质量门禁为证据要求。未满足前置时先运行 `/dev-gate`。

1. **实现**：读取 `/code-spec`，按照 spec/issues 完成工作；
2. **测试**：遵循 `/code-test`，根据质量门禁新增测试逻辑；
3. **验收**：执行 `/verifying`，根据质量门禁验证工作；
4. **审查**：调用 `/code-review` 完成双轴审查；
5. **提交**：获得用户授权后，为完成内容创建 commit。

基线漂移则返回 `/dev-gate`，更新权威入口并重新确认。
