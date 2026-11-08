---
name: 'nano-flow 重构与 dsh 迁移'
description: '把 nano-flow 插件重构、dsh 领域文档生成与旧 plans 迁移收进同一个 Plan。'
status: in_progress
---

# nano-flow 重构与 dsh 迁移

## 目标

用一个 Plan 记录两条工作线：nano-flow 插件重构，以及 dsh 旧领域文档与旧 plans 的迁移。此前分散的“生成并迁移 dsh 领域文档”和“迁移 dsh 旧 plans”两个 Plan 已归档，内容合并到这里。后续同域的 nano-flow 插件增强（Note 面板、Plan 轨迹日志）也落在本 Plan。

## 范围

- nano-flow 插件：文档格式、工具面、提示词注入、索引生成、篇幅限制与预设行为。
- dsh 领域文档：CONTEXT、questions、adr、workflows 的生成与旧文档适配。
- dsh 旧 plans：17 个旧 Plan 从 `story/spec/notes.json` 迁到 `spec + note`。
- 插件增强：会话内 Note 面板（007）、`plan/log.jsonl` 轨迹日志（009）、轮转保留分组与置顶（010）。
- 不迁移其他域（common、nano-flow、etf、music、video）；不删除 `.tmp` 原文。

## 结果

- note 001 完成插件重构。
- note 002 完成 dsh 领域文档生成与旧 dsh 文档迁移。
- note 003 完成 17 个 dsh 旧 plans 迁移。
- note 004 把生成的 `CONTEXT-MAP.md` 从工作区根迁到 `.agents/domains/`（版本 0.5.11）。
- note 005 修正旧 Plan 的 119 条失效相对链接：46 条重指、73 条死链降为纯文本。
- note 006 把固定提示词改名为 `prompts/system.md`，段名改 `nano-flow:system`，顺带消除被当成 `AGENTS.md` 注入的副作用。
- note 007 新增会话内 Note 面板：`conversation.input.dock` + 宿主路由快照 + 客户端 5s 轮询；行内为「中文状态名 + note 名称」（已验收）。
- note 008 定位并修复 `nano-flow/notes` 事件导致的历史加载失败：补 `ignorable` 止血，面板数据改走宿主路由；用户已确认历史加载正常（`completed`）。
- note 009 实现 Plan 轨迹日志：每轮 compact 记录追加到 `<plan>/log.jsonl`，宿主事件订阅 + 持久化回填；live 验收发现绑定轮记录不完整，已在 0.5.23 用按轮 pending 缓冲修复（`in_progress`，待重启复验）。
- note 010 修复轮转丢分组与置顶：新会话继承旧会话的工作区槽位与置顶状态（0.5.23，待 live 验证）。
- `nano_flow_check` 通过；插件已安装 0.5.23。

## 当前进度

note 001–008 完成；note 009 进入 live 验收并发现绑定轮记录不完整（user 空、tools 只剩尾部），已在 0.5.23 修复（按轮 pending 缓冲）；note 010 修复轮转丢分组/置顶。两处修复都已过单测与 `vp check`（280 例），0.5.23 已装入 desktop profile，**重启宿主后 live 复验**。本轮同时把本地 `vite-plus` 工具树从 0.1.6 升级到 **0.2.2-rc.1**（与运行宿主一致），后续实现与取证都以它为准。旧的两个 Plan 归档在 `plans/archived/`；旧 plans 原文保留在 `.tmp/nano-flow-legacy/domains/dsh/plans/`。

## 恢复入口

先读 `notes_index.md`；插件细节在 001，领域文档在 002，旧 plans 映射与截断在 003，`CONTEXT-MAP.md` 位置修正在 004，旧 Plan 链接校正在 005，提示词改名在 006，Note 面板在 007，历史加载失败在 008，Plan 轨迹日志的设计、拷问与 live 验收在 009，轮转分组/置顶修复在 010。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
| [009-Plan轨迹日志](009-Plan%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97.md) | 在每个 Plan 目录追加 log.jsonl，把对应 nano-flow 会话的每轮轨迹（精简）持久化。 | in_progress | — | 重装 0.5.23 并重启宿主，触发绑定轮，确认记录含完整 user/assistant/tools/usage/seq；再验轮转后新段头 | 007-会话内未完成note面板, 008-修复notes事件导致会话历史加载失败 |
| [010-轮转保留分组与置顶](010-%E8%BD%AE%E8%BD%AC%E4%BF%9D%E7%95%99%E5%88%86%E7%BB%84%E4%B8%8E%E7%BD%AE%E9%A1%B6.md) | 轮转创建的新会话要继承旧会话的工作区分组槽位与置顶状态，不再掉进「未分组」。 | in_progress | — | 重装 0.5.23 并重启宿主，触发一次轮转后确认新会话仍在原工作区分组与原位置、且置顶保留 | 009-Plan轨迹日志 |
| [011-轨迹日志绑定轮修复](011-%E8%BD%A8%E8%BF%B9%E6%97%A5%E5%BF%97%E7%BB%91%E5%AE%9A%E8%BD%AE%E4%BF%AE%E5%A4%8D.md) | live 验收发现绑定轮记录不完整；改用按轮 pending 缓冲合并未完成轮事件，待重启复验。 | in_progress | — | 重启宿主后在本会话触发一次绑定轮，确认 log.jsonl 的绑定轮含完整 user/assistant/tools/usage/seq | 009-Plan轨迹日志 |
