---
name: ask
description: 用户显式进入拷问循环时使用；按基本提示词里的 ask 循环推进，收敛后再进入交付。
disable-model-invocation: true
---

# Ask

用户显式要求走拷问循环（`/ask`）。执行步骤：

1. 用 `nano_flow_read` 的 `resume` 取当前 Plan 的关键索引与可推进队列；确认哪些已经定案、哪些还没问。
2. 按基本提示词里的 **ask 循环**推进：取证 → 一轮问题 → 等待回答 → 写回 Plan → 重算待问。
3. 问题用 `ask_user_question` 提出，每题给推荐答案与理由。
4. 收敛后把结论写回 story、spec 或 notes，并给出下一步（通常是 `/do`）。
