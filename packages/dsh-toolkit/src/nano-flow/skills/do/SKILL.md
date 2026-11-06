---
name: do
description: 用户显式要求交付时使用；把一条 note 推进到可验收完成。
disable-model-invocation: true
---

# Do

1. 用 `nano_flow_read` 的 `ready` 选一条可推进的 note；没有可推进的就先回报可推进队列与阻塞项。
2. 按 **do 循环**推进：门禁 → 执行 → 验证 → 写 `evidence` → `complete`。
3. 门禁未确认的项记为未验证，不要用「已完成」掩盖。
4. 完成后回到可推进队列，报告下一条与当前整体状态。
