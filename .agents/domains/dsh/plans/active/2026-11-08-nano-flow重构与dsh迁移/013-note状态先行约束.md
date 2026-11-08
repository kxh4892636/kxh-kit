---
name: "013-note状态先行约束"
description: "nano-flow 系统提示词要求新建或变更 note 时先落 YAML 头再补正文，使 Note 看板及时反映状态。"
status: in_progress
related_noted:
  - '007-会话内未完成note面板'
next_step: "0.5.24 构建安装后重启宿主，确认会话注入的 nano-flow 提示词含「状态先行」条款且看板按 YAML 头刷新"
---

# 013-note状态先行约束

## 背景

Note 看板只读 note 的 YAML 头（`status`/`next_step`/`description`），并在 5s 轮询里刷新。此前提示词只说「每轮形成新事实后跑一次 `nano_flow_check`」，没有要求先落状态；写长 note 时正文与状态一起落盘，看板要等到整篇写完才变。

## 实现（0.5.24）

`src/nano-flow/prompts/system.md` 的 Plan 一节新增：

> **状态先行**：新建 note、变更状态或下一步时，先把文件与 YAML 头（`status`、`reason`、`next_step`）落盘，再补正文；Note 看板只读 YAML 头，这样状态变更能第一时间显示。长正文可以随后分次写完。

`nano_flow_create` 本身已按模板先写 YAML 头，这条约束覆盖「改状态」和「手写新 note」两种路径。

## 验收

- 构建产物 `dist/nano-flow/prompts/system.md` 含该条款。
- 重启宿主后，新会话注入的 `nano-flow:system` 段包含该条款（挂载快照 promptBytes 变化）。
- 看板在 note 状态变更后 5s 内刷新（沿用既有轮询，不改代码）。
