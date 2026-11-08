---
name: 'nano-flow 重构与 dsh 迁移'
description: '把 nano-flow 插件重构、dsh 领域文档生成与旧 plans 迁移收进同一个 Plan。'
status: in_progress
---

# nano-flow 重构与 dsh 迁移

## 目标

用一个 Plan 记录两条工作线：nano-flow 插件重构，以及 dsh 旧领域文档与旧 plans 的迁移。此前分散的“生成并迁移 dsh 领域文档”和“迁移 dsh 旧 plans”两个 Plan 已归档，内容合并到这里。

## 范围

- nano-flow 插件：文档格式、工具面、提示词注入、索引生成、篇幅限制与预设行为。
- dsh 领域文档：CONTEXT、questions、adr、workflows 的生成与旧文档适配。
- dsh 旧 plans：17 个旧 Plan 从 `story/spec/notes.json` 迁到 `spec + note`。
- 不迁移其他域（common、nano-flow、etf、music、video）；不删除 `.tmp` 原文。

## 结果

- note 001 完成插件重构。
- note 002 完成 dsh 领域文档生成与旧 dsh 文档迁移。
- note 003 完成 17 个 dsh 旧 plans 迁移。
- note 004 把生成的 `CONTEXT-MAP.md` 从工作区根迁到 `.agents/domains/`（版本 0.5.11）。
- note 005 修正旧 Plan 的 119 条失效相对链接：46 条重指、73 条死链降为纯文本。
- note 006 把固定提示词改名为 `prompts/system.md`，段名改 `nano-flow:system`，顺带消除被当成 `AGENTS.md` 注入的副作用。
- note 007 新增会话内 Note 面板：`conversation.input.dock` + 宿主路由快照 + 客户端 5s 轮询；行内改为「中文状态名 + note 名称」（`blocked`，等用户确认文本版观感）。
- note 008 定位并修复 `nano-flow/notes` 事件导致的历史加载失败：补 `ignorable` 止血，面板数据改走宿主路由；用户已确认历史加载正常（`completed`）。
- `nano_flow_check` 通过；插件已安装 0.5.21。

## 当前进度

note 001–006、008 完成；note 007 处于 `blocked`，只差用户确认 0.5.21 的文本版面板（标题 + 「阻塞/待处理/进行中 + note 名称」+ 收起/展开）。期间定位并修复了面板首帧渲染崩溃（插件 bundle 里 primitives 导出为 `undefined`，React #130）：改为可渲染才复用、否则内联兜底，并按用户要求去掉图标。测试 262 项、`vp check` 通过。旧的两个 Plan 归档在 `plans/archived/`；旧 plans 原文保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板设计与验收条件在 007，历史加载失败的根因与替代方案在 008。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [007-会话内未完成note面板](007-%E4%BC%9A%E8%AF%9D%E5%86%85%E6%9C%AA%E5%AE%8C%E6%88%90note%E9%9D%A2%E6%9D%BF.md) | 在输入框 dock 展示当前会话绑定 Plan 的未完成 note，样式与 TODO 面板一致。 | blocked | 0.5.21 已把行内状态改成中文名并去掉图标；等待用户确认文本版面板的最终观感 | 重启后确认面板已显示「阻塞 + note 名称」，确认后置 completed | 006-固定提示词改名为system, 008-修复notes事件导致会话历史加载失败 |
