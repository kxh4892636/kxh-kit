---
name: '005-输入框上方的ready面板'
description: '在输入框上方加可折叠的 Nano Flow ready 列表面板，含宿主路由与客户端 dock。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 005-输入框上方的ready面板

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 目标

- 在会话输入框上方(`conversation.input.dock`)显示当前 Nano Flow Plan 的未完成 notes, 按依赖组展示, 支持展开/折叠。
- 仅在 Nano Flow 会话显示; 没有 active Plan 时隐藏。

## 设计

- 宿主路由 `GET /api/toolkit/nano-flow-ready?sessionId=`: 定位工作区, 读 active Plan 的 `notes.json`, 用 `todoGroups` 分组; 返回 plan、counts、groups。
- 客户端在 `conversation.input.dock` 注册 `ReadyPanel`: 3s 轮询 + 窗口 focus 刷新; 默认折叠; header 显示未完成/进行中/阻塞/已完成计数与 chevron; body 显示分组与 note 状态。
- 展示与否由客户端按会话 projection 的 `agentPreset` 判断; 宿主只读 Plan。
- 复用 toolkit 样式表与 `--dsw-*` tokens; 面板宽度对齐 composer。

## 执行检查点(2026-11-07)

- 宿主: `src/host/nano-flow-ready.ts` 的 `readNanoFlowReady`(active Plan、todoGroups、counts); 路由 `TOOLKIT_NANO_FLOW_READY_PATH`。
- 客户端: `src/client/ready-panel.ts`, 注册在 `conversation.input.dock`(order 10), 默认折叠、3s 轮询、focus 刷新; 样式在 `stylesheet.ts`。
- 首次真机: 面板挂载与请求正常, 但返回 `not-nano-flow`。根因是宿主 live session header 的 `agentPreset` 不可靠。
- 修复: 宿主去掉 `agentPreset` 拦截, 工作区先取 `header.cwd`, 取不到再从 `workspaceRegistry` 按 `sessionIds` 找 `path`; 客户端按 `useSession` 的 `projectionValues.agentPreset` 判断是否显示。
- 用户已确认面板出现在输入框上方; 诊断行已移除。
- 验证: 219 测试通过; `vp check` 通过; `build` 成功。

## 验收

- 新会话输入框上方出现面板; 折叠/展开可用; 内容与 `nano_flow_read` 的 `ready` 一致; 非 Nano Flow 会话不显示。
- 宿主/客户端测试通过; 构建、真机确认。

## 不做

- 面板只读, 不编辑 note。
- 多个 active Plan 时隐藏, 不做选择器。

## 迁移前的证据
- 用户截图确认面板出现在输入框上方；初始诊断行为 `Nano Flow · 不可用（not-nano-flow）`，定位到宿主 live session header 的 agentPreset 不可靠
- 修复：宿主 ready 去掉 agentPreset 拦截，工作区取 header.cwd 或 workspaceRegistry.path；客户端按 projectionValues.agentPreset 判断
- 219 测试通过；vp check 通过；build 成功
- 最终版移除诊断行，用户确认面板正常显示
