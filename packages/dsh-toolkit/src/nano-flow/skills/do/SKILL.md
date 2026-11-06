---
name: do
description: 把一条 note 推进到可验收完成时使用; 按 do 循环走门禁,执行,验证与 evidence.
---

# Do

1. 用 `nano_flow_read` 的 `ready` 看依赖分组, 取前置已完成的 note; 可并行的用 subagent, 没有可执行的就先回报队列与阻塞项.
2. 按 **do 循环**推进: 门禁 → 执行 → 验证 → 写 `evidence` → `complete`.
3. 门禁未确认的项记为未验证, 不要用"已完成"掩盖.
4. 完成后回到可推进队列, 报告下一条与当前整体状态.
