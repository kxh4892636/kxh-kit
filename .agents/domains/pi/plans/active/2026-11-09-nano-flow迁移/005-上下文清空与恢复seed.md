---
name: '005-上下文清空与恢复seed'
description: '达到 rotateAt 时写重置条目，context 按时间过滤历史，并把当前 Plan 与上一轮输出作为 seed 插回；不新建会话。'
status: 'blocked'
reason: '等待用户验收'
next_step: '把 rotateAt 调到 0.0001，连续两轮确认 reset 条目与过滤后的上下文'
related_noted: []
---

# 上下文清空与恢复 seed

## 交付

- `before_agent_start` 读 `ctx.getContextUsage()`；`tokens / contextWindow >= rotateAt` 时写 `nano-flow-reset { at, seed }` 并 notify。
- `context` 事件过滤 timestamp < at 的消息，把 seed 作为首条 user 消息插回；本轮用户输入原样保留。
- seed = 清空说明 + 当前 Plan（有绑定指名，没有绑定要求先 bind）+ `<rotation-last-output>` 包裹的上一轮 assistant 输出（尾部截断 8 KB）。
- 同一轮重复触发有保护，不会连续写多条 reset。

## 验收

把 rotateAt 调到很低，发一条消息：模型看到 seed + 本轮输入，看不到旧历史；会话 JSONL 仍保留完整历史。


## 结果

- 已实现并通过 `pnpm --filter @kxh4892636/pi-toolkit test`（220 项）与 `check`。
- 真机冒烟：`nano_flow_create` 建 domain/plan、`nano_flow_bind` 写会话条目、rotateAt=0.0001 产生 `nano-flow-reset` 均已在 pi 1.5.0 验证。
- fullscreen 侧栏与 `/nano-flow` 选择器留待用户验收。
