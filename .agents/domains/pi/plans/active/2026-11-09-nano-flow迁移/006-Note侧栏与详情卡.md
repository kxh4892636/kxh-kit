---
name: '006-Note侧栏与详情卡'
description: 'fullscreen 右上角 Note 侧栏只显示当前绑定 Plan 的未完成 note；行显示中文状态 + note 名，点击出概述/原因/下一步详情卡。'
status: 'blocked'
reason: '等待用户验收'
next_step: 'fullscreen 下确认侧栏、点击详情卡、Esc 关闭与 turn_end 刷新'
related_noted: []
---

# Note 侧栏与详情卡

## 交付

- 简化旧 orchestrator 的 overlay：去掉 worker 分组、实时流与定时轮询；保留 40 列右上角、图标切换、鼠标命中和 Esc 关闭。
- 只显示 `pending / in_progress / blocked` 的 note；行 = 中文状态 + note 名；无绑定、目录失效或无未完成 note 时不显示。
- 点击行打开详情卡：标题含 note 名与状态，正文依次是概述、`原因：`、`下一步：`。
- `turn_end` 时重读磁盘一次；`/nano-flow on`、session_start 也刷新；regular 模式不挂载。

## 验收

fullscreen 下侧栏随绑定 Plan 出现；点击条目出卡片；Esc/× 关闭；regular 模式无侧栏且不报错。


## 结果

- 已实现并通过 `pnpm --filter @kxh4892636/pi-toolkit test`（220 项）与 `check`。
- 真机冒烟：`nano_flow_create` 建 domain/plan、`nano_flow_bind` 写会话条目、rotateAt=0.0001 产生 `nano-flow-reset` 均已在 pi 1.5.0 验证。
- fullscreen 侧栏与 `/nano-flow` 选择器留待用户验收。
