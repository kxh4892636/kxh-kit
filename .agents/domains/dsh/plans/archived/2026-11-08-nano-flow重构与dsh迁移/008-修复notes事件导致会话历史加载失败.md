---
name: "008-修复notes事件导致会话历史加载失败"
description: "nano-flow 会话写入的 nano-flow/notes 事件没有 ignorable 标记，宿主冷读日志时拒绝加载整个会话。"
status: completed
reason:
related_noted:
  - '007-会话内未完成note面板'
next_step: '已验收：历史加载正常；面板改走宿主路由（0.5.17 → 0.5.21）'
---

# 008-修复notes事件导致会话历史加载失败

## 现象

2026-11-08 14:52，GUI 打开会话 `session-80f0ac73-653b-4bd1-9948-9a79d2a98907` 时历史加载失败（gateway/internal）：

```text
failed to observe session "session-80f0ac73-…": session "…" contains event type
"nano-flow/notes" (seq 1362) unknown to this harness and not marked ignorable;
refusing to interpret the log — it was likely written by a newer harness
```

会话本身没有损坏：13:23 创建、14:50:40 仍在正常写入；14:46:30 写入的这条事件使之后任何一次冷读（重启、重新打开或 gateway observe）都拒绝整条日志。

## 取证

- 日志 `session.v4.jsonl.zstd` 是 845 个独立 zstd frame、1518 行（1 行 header + 1517 个事件）；seq 连续 0–1516。
- seq 1362 是唯一未知事件：`type: "nano-flow/notes"`，`time: 2026-11-08T06:46:30.325Z`（14:46:30），`data` 是 note 007 的面板快照（`planName` / `planPath` / 1 条 blocked note），**没有 `ignorable`**。
- 写入时机：14:46:30 宿主 5s 轮询发现 007 刚改成 `blocked`，于是 `session.append("nano-flow/notes", snapshot)` 落盘；同一秒前后的工具调用与 step 事件都正常。
- 全量扫描 `$DSH_HOME/sessions` 的 111 个日志：未知且非 ignorable 的事件只有这一条；其余日志不受影响。
- 会话在 14:46 处于 nano-flow 预设（日志里 13:55 有 `agent-preset/selected: nano-flow`），面板作用域判断本身没有错。

## 原因

1. **DSH 0.2.2 的读路径 fail-closed**：`@deepseek-ai/dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES` 是构建期生成的静态集合，只含本仓库声明的事件；`dsh-session-persistence` 的 `validateStoredEvents` 遇到集合外、且没有 `ignorable: true` 的事件会抛 `SessionFormatUnsupportedError`，整个会话拒绝重建（`lib/index.js:184` 附近）。
2. **写路径允许它通过**：插件用 `session.append("nano-flow/notes", …)` 写日志时，`append` 只校验 surface/序号/payload，不校验类型是否可读回，也不提供 `ignorable` 选项。于是出现“写得进去、冷读读不出来”的不对称：live 会话的内存日志正常，重启/冷读才失败。
3. **第三方插件没有合法的自定义事件通道**：0.2.2 里唯一会写 `ignorable: true` 的入口是 `appendPluginRecord(session, "plugin:…", data)`，它要求 `plugin:` 命名空间，且文档明确“仓库外插件也不得调用”（`dsh-session/README.md` 的 *Write experimental plugin records*）。事件的 `SessionEventMap` 声明合并只解决 TypeScript 类型，不会把类型加进 `KNOWN_SESSION_EVENT_TYPES`。
4. **结论**：`nano-flow/notes` 这类由工作区文件系统派生、只服务 UI 的面板状态，根本不应进入会话日志。note 007 的 Q1/A6（“绑定写进会话日志、重启后回放”）建立在一个宿主不支持的假设上。

## 已处理（止血）

- 离线修复该日志：只给 seq 1362 补 `"ignorable":true`，保持帧边界与全部 seq 不变；原文件备份在 `.tmp/repair-backups/session-80f0ac73-session.v4.jsonl.zstd.bak`。
- 复核：845 帧全部可解、1517 个事件 seq 连续、唯一变化是目标事件多了 `ignorable`、未知非 ignorable 归零；该事件仍可被面板投影识别，历史不丢内容。
- 再次全量扫描 111 个日志：0 个未知非 ignorable，修复后的会话可以冷读。

## 修复方案（待实施）

不再让面板写会话事件，改为“宿主按需计算 + 客户端轮询”：

- 宿主半（toolkit 根插件，非预设作用域）：新增 `GET /api/toolkit/nano-flow/notes?sessionId=…`，用 `ctx.sessions.get(sessionId)?.header.cwd` 定位工作区，复用 `notes.ts` 的 `listActivePlans` / `resolveBoundPlan` / `buildNotesSnapshot` 现算快照；无会话、无唯一 active Plan 或无未完成 note 时返回 `null`。路由已有 `connection.fetch.register` 先例（`undo-turn` / `nano-flow` 设置）。
- 客户端半：`NotesDock` 增加标准 `sessionId` prop（与 `UndoButtonProps` 同源），保留 `agentPreset` 门禁；组件挂载且处于 nano-flow 预设时每 5s `fetch` 上述路由，卸载即 abort；不再读 `nanoFlowNotes` 投影。
- 删除：`NOTES_EVENT`、`notesProjection`、`createNotesPanel` 的 append/attach/5s 定时器与投影注册；`notes.ts` 的纯计算函数保留。
- 语义变化：绑定不再持久化，每次请求按“唯一 active Plan”重算；重启后首次轮询面板即恢复；A5/A6 随之作废（Plan 移走即消失，不追新路径；同一工作区若始终只有一个 active Plan，等价于原绑定）。
- 不采用 `appendPluginRecord`：它是仓库内实验通道，外部插件被明确禁止调用；不采用删除事件：会改变后续全部 seq，破坏 `sourceEventSeqs` 与工具结果引用。

## 验收

- 新 nano-flow 会话：面板出现；改一条 note 状态后 ≤5s 更新；重启宿主、重开历史不再报错，面板仍显示。
- 会话日志里不再出现 `nano-flow/notes`；全量扫描 0 个未知非 ignorable 事件。
- `vp check`、`vp test src`、构建通过；安装新版本并重启后按 README 第 9 条验收。

## 实施记录

- 契约（`src/contract.ts`）：新增 `TOOLKIT_NANO_FLOW_NOTES_PATH`、`NanoFlowNotesResponse`、`NotesSnapshot` / `PanelNote` / `PANEL_STATUSES`、`NANO_FLOW_NOTES_REFRESH_MS`。
- 宿主：`host/toolkit-routes.ts` 注册 `GET /api/toolkit/nano-flow/notes?sessionId=…`；`index.ts` 的 `notesOf(sessionId)` 从 `ctx.sessions.get(id).header.cwd` 取工作区，调用 `nano-flow/notes.ts` 新增的 `notesForWorkspace`（只认唯一 active Plan，现算快照）。
- 删除：`src/nano-flow/notes-panel.ts`（投影 + 会话事件 + 宿主 5s 计时器）整文件；`plugin.ts` 不再 `inject(["sessionProjections"])`、不再 attach/refresh/dispose 面板。
- 客户端：`NotesDock` 用标准 `sessionId`（缺失时 `useSession` 兜底），保留 `agentPreset` 门禁，挂载后每 5s 调 `fetchNanoFlowNotes`，卸载 abort；`host-api.ts` 逐层校验响应，不再读 `nanoFlowNotes` 投影。
- 依赖：删除 `zod`（唯一使用点是旧投影 schema），`pnpm-lock.yaml` 同步。
- 测试：261 项通过（34 文件），含路由、快照计算、dock 首轮与 5s 轮询、根插件路由集成与「pre-step 不再 append」回归；`vp check` 88 文件格式 / lint / 类型通过。
- 构建与安装：`dist/index.mjs` 116.02 kB、`dist/client.js` 56.9 kB；`@kxh4892636/dsh-toolkit@0.5.17` 已装入 desktop profile，安装包与本地构建 SHA256 一致。
- **未验证（需重启宿主）**：新路由在真实会话里返回快照、面板 5s 刷新、hover/折叠，以及重启后历史加载不再报错。

## 验收前置（自动可验证部分）

- 0.2.2 的插槽目录确认 `conversation.input.dock` 的 standardProps 含 `sessionId` / `useSession` / `useProjection`（`dsh-cordis-client-runner/lib/client.js` 的 slot catalog），客户端能直接拿到当前会话 id。
- 运行中的宿主主进程启动于 14:50:58，早于 15:07 的 0.5.17 安装；新路由与新版客户端必须重启宿主后才会加载，因此真机验收无法在本轮自动完成。
- 安装后的 `dist/index.mjs` / `dist/client.js` 与本地构建 SHA256 一致；desktop profile 的 `package.json` 已指向 0.5.17 tarball。

## 遗留

- 本 note 完成条件包含真机重启验收；面板重新可用前，007 保持 `blocked`。
- 修复只覆盖该一条历史日志；不做全局批量补标记（当前扫描无其他受害者）。

## 验收记录

- 用户重启宿主后确认「008 没有问题」（会话历史可正常加载）；后续面板问题属渲染层，由 007 跟踪（0.5.18 → 0.5.21）。
- 最终版本 0.5.21：面板改走宿主路由 + 客户端 5s 轮询，日志不再写 `nano-flow/notes`。
