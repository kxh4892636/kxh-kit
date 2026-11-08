---
name: '001-状态改名与needs定案'
description: '定案：awaiting_verification → waiting（等待确认），带 needs answer/review，旧值读入兼容。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 001-状态改名与needs定案

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 拷问记录

### 第 1 轮

#### Q1 - 改哪个包

- 问题: 改 `dsh-toolkit` 的 nano-flow，还是 `pi-toolkit` 的 orchestrator？
- 前置问题: 无
- 下游边界: 决定改动面与 Plan 归属。
- 推荐答案及理由: 改 dsh——本会话提示词仍是 `awaiting_verification`；pi 侧已是 `waiting + needs`。
- 处理结论: 用户选 dsh-toolkit 的 nano-flow；旧 dsh Plan 已归档，本 Plan 新建。

#### Q2 - 是否照搬 needs

- 问题: 只改状态名与含义，还是照搬 pi 的 `needs=answer|review`？
- 前置问题: Q1
- 下游边界: 影响 write / read / complete 门槛、面板展示与文档。
- 推荐答案及理由: 照搬——「验证和提问都属于这个阶段」正好需要区分等回答与等验收。
- 处理结论: 用户选照搬 `needs`。

### 补充说明

- 用户原话：`awaiting_verification` 名称修改为 `waiting`，含义为等待用户确认，验证和提问都属于这个阶段。

## 定案

- id `waiting`，显示名「等待确认」。
- `waiting` 必须带 `needs`：`review`（等验收，写「待验证」）/ `answer`（等人回答，写「待回答」）。
- `complete` 只接受 `waiting + needs=review`；`pending` 不能直接进 `waiting`。
- 旧值 `awaiting_verification` 读入时折成 `waiting + needs=review`（只读兼容，新写入只用 `waiting`）。
- `ready` 不列 `waiting`；依赖分组里排在可执行项之后、`blocked` 之前；`resume` 分「等待回答 / 等待确认」两段。

## 迁移前的证据
- 用户确认（2026-11-08）：改 dsh-toolkit 的 nano-flow；照搬 pi 的 needs=answer|review
- 参照实现：packages/pi-toolkit/src/orchestrator/dag.ts 的 NOTE_NEEDS 与 LEGACY_WAITING_STATUS、write.ts 的 status/complete 门槛、read.ts 的等待回答/等待验证分段
