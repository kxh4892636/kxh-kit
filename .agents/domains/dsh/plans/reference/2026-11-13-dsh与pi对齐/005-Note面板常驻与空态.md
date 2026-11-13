---
name: "005-Note面板常驻与空态"
description: "dsh 的 Note dock 改为已绑定 Plan 时常驻，未完成列表为空时显示「全部完成」空态，与 pi 侧栏一致。"
status: completed
related_noted: ["007-发布0.5.47并真机验收"]
next_step: "无；web 真机观察在 007"
---

# 005-Note面板常驻与空态

## 目标

pi 的 Plan [2026-11-09-Note侧栏常驻与折叠]() 明确写了「本轮只改 pi-toolkit，dsh 版保留旧行为，两处规则暂时不一致」。本次反向对齐：已绑定 Plan 时面板常驻，列表为空也渲染。

## 交付

- `src/nano-flow/notes.ts`：无绑定或目录失效仍返回 `null`；已绑定但无未完成 note 时返回空数组（不再返回 `null`）。
- `src/client/notes-dock.ts`：快照非空即渲染标题行与计数；列表为空时追加一行 dim「全部完成」，空态行不可点击。
- 单测：`notes.test.ts`、`notes-dock.test.ts` 覆盖空列表、无绑定、目录失效三种情况。

## 验收

- 单测通过；web 真机：把绑定 Plan 的 note 全部置 completed，面板仍在并显示空态；未绑定或目录失效时不显示。
- 折叠/展开行为不变（dsh 已有，无需搬 pi 的折叠图标）。

## 范围外

- pi 的 TUI overlay、右上角折叠图标、详情卡：宿主能力不同，不做。

## 交付记录（2026-11-13）

- `buildNotesSnapshot` 在已绑定 Plan 时始终返回快照（未完成列表可为空）；`notes-dock` 去掉「空列表不渲染」，标题计数为空时显示「全部完成」，展开后渲染一行不可点的空态；stylesheet 增加 `.dshtk-notes-empty`。
- 测试：`notes.test` 的空列表断言改为返回空快照；`notes-dock.test` 新增空态用例。
- 验证：359 项测试通过；构建通过；安装后 client.js 含 `dshtk-notes-empty`（真机观察在 007）。

