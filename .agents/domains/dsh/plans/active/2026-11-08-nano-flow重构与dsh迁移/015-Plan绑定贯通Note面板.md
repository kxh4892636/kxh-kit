---
name: "015-Plan绑定贯通Note面板"
description: "PTC 下首次工具调用即建立会话↔Plan 绑定；Note 面板只对已绑定会话显示，且默认折叠。"
status: blocked
reason: "等宿主重启加载 0.5.26 后做 live 验收：新会话不显示看板、首次工具调用后出现且默认折叠"
related_noted:
  - '007-会话内未完成note面板'
  - '009-Plan轨迹日志'
  - '011-轨迹日志绑定轮修复'
next_step: "用户重启宿主后，新开 Nano Flow 会话确认无看板；调用一次工具（含 run_code 内的 nano-flow 工具）后确认绑定写入、看板出现且折叠"
---

# 015-Plan绑定贯通Note面板

## 背景

用户发现两处问题：

1. 新开的 Nano Flow 会话还没和任何 Plan 建立绑定，也显示 Note 看板。根因：宿主路由 `notesOf` 只按「工作区里恰好一个 active Plan」现算快照，从不看会话↔Plan 绑定，于是任何会话都拿到同一份未完成 note。
2. 看板默认展开。根因：`notes-dock.ts` 的 `useState(false)`。

另有一条连带问题：014 切到 PTC 后，宿主看到的工具调用是 `run_code`，而 009 的绑定触发只认 `data.name` 以 `nano_flow_` 开头的 `tool/call`，于是绑定永远不写、看板也就永远无数据。

## 实现（0.5.26）

- 绑定表路径收口为 `bindingsFilePath(config)`，可用 `config.bindingsFile` 覆盖（测试与路由共用）。
- `plan-log-service`：按 `agent-preset/selected` 记下每个会话的预设；预设为 nano-flow 时，PTC 下首个 `run_code` 的 `tool/call` 也允许绑定；预设已知非 nano-flow 的会话一律忽略。
- `notesOf`：先查绑定表；未绑定返回 `null`（面板不显示），已绑定则只算该绑定 Plan 的未完成 note。
- `notes-dock`：默认折叠（`useState(true)`）。

## 验证

- `vp test src`：37 文件 / **291 例通过**（新增：PTC 首次 `run_code` 绑定、非 nano-flow 预设不绑定；index 路由补「未绑定返回 null」；面板默认折叠改断言）。
- `vp check`：格式、lint、类型通过（94 文件）。
- 0.5.26 已构建并装入 desktop profile（`%TEMP%\kxh4892636-dsh-toolkit-0.5.26.tgz`）。

## 待 live

- 重启宿主后：新开 Nano Flow 会话应看不到 Note 看板；调用一次工具后绑定写入，面板出现且默认折叠。
- 绑定恢复同时解除 009/011 的阻塞：重启后先验证绑定，再读 `log.jsonl` 核对绑定轮完整性。
