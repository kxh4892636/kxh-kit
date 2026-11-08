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
- note 007 新增会话内 Note 面板：`conversation.input.dock` + 会话投影 `nanoFlowNotes` + 5s 轮询（`blocked`，等待重启宿主验收）。
- `nano_flow_check` 通过；插件已安装 0.5.14。

## 当前进度

note 001–006 完成；note 007 处于 `blocked`，等用户重启宿主验收 Note 面板（验收通过才置 `completed`）。插件已装 0.5.14。旧的两个 Plan 归档在 `plans/archived/`；旧 plans 原文保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板设计与验收条件在 007。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [007-会话内未完成note面板](007-%E4%BC%9A%E8%AF%9D%E5%86%85%E6%9C%AA%E5%AE%8C%E6%88%90note%E9%9D%A2%E6%9D%BF.md) | 在输入框 dock 展示当前会话绑定 Plan 的未完成 note，样式与 TODO 面板一致。 | blocked | 等待用户重启宿主验收 Note 面板：面板出现、5s 刷新、tooltip 与折叠通过后才置 completed | 重启后按 README 验证第 9 条确认面板，验收通过再置 completed | 006-固定提示词改名为system |
