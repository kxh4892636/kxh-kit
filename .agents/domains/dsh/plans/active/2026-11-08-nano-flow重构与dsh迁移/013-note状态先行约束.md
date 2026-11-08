---
name: "013-note状态先行约束"
description: "nano-flow 系统提示词要求新建或变更 note 时先落 YAML 头再补正文，使 Note 看板及时反映状态。"
status: completed
related_noted:
  - '007-会话内未完成note面板'
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
## live 验收（2026-11-08，0.5.25）

- 已装 `dist/nano-flow/prompts/system.md` 含「状态先行」行；本会话注入的固定提示词同文，条款在场。
- 看板数据面：`notesForWorkspace` 只在请求时现算 YAML 头（`src/nano-flow/notes.ts:105-124`，注释「每次请求都是当前文件系统状态」）；客户端每 5s 拉一次（`src/client/notes-dock.ts:134`，`NANO_FLOW_NOTES_REFRESH_MS=5_000`），且仅在 `agentPreset=nano-flow` 的会话渲染（同文件 111 行）。
- 本轮把 014 改为 completed 后，面板应在 5s 内少一条未完成 note（数据源与轮询间隔已按上述代码取证，未改代码）。
