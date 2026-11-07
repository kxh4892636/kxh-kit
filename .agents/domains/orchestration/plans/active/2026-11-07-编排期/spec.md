# 编排期 2026-11-07 — 规格

## 用途

`orchestration` 域的运行时 Plan：承载「谁做、做到哪、谁放行」。业务域的 Plan 由各自的 worker 推进，这里只记追踪与待办。

## 规则

- 一条 note = 一个需要编排方记住的未结事项（待归属的输入、等用户回答的确认、追踪中的 Plan）。
- 结清即 `completed`；全部结清后由编排方 `move` 到 `archived`。
- 业务域 Plan 的 note 不由本域写，本域只读。
- 本 Plan 不设 story 之外的验收物；每轮的实质产出写进对应业务域 Plan。

## 本次编排期的追踪对象

| 业务域 Plan / 事项 | 状态 | 需要编排方做什么 |
| --- | --- | --- |
| `pi/active/2026-11-07-pi多plan编排` | note 13 已完成，note 14 `waiting/review` | 等用户对 note 14 放行 |
| 同一 Plan 的并发派工问题（note 15） | `waiting/answer` | 等用户在两个触发器上定案 |
| `video/archived/2026-11-07-图片文字录音剪辑为视频` | 已归档，工程已删除 | 无（已结） |

## 环境事实

- 工作区 `kxh-kit`；域根 `.agents/domains`；
- 编排方工具：`orchestrator_read` / `orchestrator_write` / `orchestrator_check` / `orchestrator_dispatch` / `orchestrator_workers` / `ask_questions`；
- worker 侧只有受限 `orchestrator_read` / `orchestrator_write` 与 `orchestrator_report`，没有 `init`、没有 `completed`。
