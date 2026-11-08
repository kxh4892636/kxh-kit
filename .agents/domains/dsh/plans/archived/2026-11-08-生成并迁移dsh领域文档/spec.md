---
name: '生成并迁移 dsh 领域文档'
description: '把旧 dsh 文档适配为新格式，并按当前插件事实生成 dsh 领域文档。'
status: completed
---

# 生成并迁移 dsh 领域文档

## 目标

在 `.agents/domains/dsh/` 生成当前格式的领域文档：CONTEXT、questions、adr、workflows，并从 `.tmp/nano-flow-legacy/domains/dsh` 迁移旧内容。迁移单独作为 note 002 记录，生成当前文档作为 note 001。

## 来源

- 旧 dsh 文档：`.tmp/nano-flow-legacy/domains/dsh/`（CONTEXT、QUESTIONS、adr 0001–0006）。
- 当前事实：`packages/dsh-toolkit` 的源码、README、cordis patch 与已安装的 0.5.5 包。
- 新格式：YAML 头、三位数字 name、生成索引、`nano_flow_check` 校验。

## 范围

- 迁移仍然有效的术语、问题与 ADR；旧的 `notes.json` / DAG / `waiting+needs` / `nano_flow_read|write` / ready 面板相关内容丢弃或标为 superseded。
- 旧 plans 目录不迁移；它们仍在 `.tmp/nano-flow-legacy/domains/dsh/plans/`，等后续 migration 任务处理。
- 当前 Plan 只记录本次文档生成与迁移，不承载旧 Plan 的历史。

## 当前进度

两份 note 均已完成：001 生成当前 dsh 文档，002 完成旧文档适配与迁移记录。`nano_flow_check` 通过。

## 恢复入口

先读 `notes_index.md` 与 note 002 的迁移记录；旧内容从 `.tmp/nano-flow-legacy/domains/dsh/` 取。若要继续迁移旧 plans，另开 Plan，不把旧计划塞回本 Plan。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
