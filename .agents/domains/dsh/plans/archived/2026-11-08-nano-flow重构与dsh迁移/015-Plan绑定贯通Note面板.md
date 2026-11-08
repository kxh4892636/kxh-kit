---
name: "015-Plan绑定贯通Note面板"
description: "PTC 下首次工具调用即建立会话↔Plan 绑定；Note 面板只对已绑定会话显示，且默认折叠。"
status: completed
related_noted:
  - '007-会话内未完成note面板'
  - '009-Plan轨迹日志'
  - '011-轨迹日志绑定轮修复'
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

## live 验收通过（2026-11-08，web 宿主 0.2.2-rc.1 + 0.5.27）

- web profile 装 0.5.27（与 desktop 对齐）后 `dsh web`，用 bsk 在 Chrome 驱动作答，验证对象就是同一份 `$DSH_HOME` 的 Plan 与会话。
- 新开 Nano Flow 会话时**没有** Note 看板（未绑定）→ gate 生效。
- 发送「运行 nano_flow_check」后：绑定表出现该会话，看板出现且默认折叠（按钮显示「展开」）；展开后为「2 进行中 · 3 阻塞」，行内状态与 YAML 头一致（009/011 进行中，010/012/015 阻塞）。
- 工具侧绑定是关键路径：事件 firehose 在本宿主下没有给出可用事件，绑定由 `nano_flow_check` 执行时经宿主 facade 写入。
