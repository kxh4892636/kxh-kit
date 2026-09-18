---
name: nano-flow
description: 启动或恢复开发任务时使用；选择 manual 或 auto 模式，持续维护必备 Plan 文档，串联逐轮拷问、可选垂直切片与代码交付。
---

# Nano Flow

## 选择模式

复用用户已有授权与模式偏好。尚未选择时，按工作性质采用下列模式并说明理由；

| 工作性质                       | 模式     |
| ------------------------------ | -------- |
| 改动大、需要用户介入与深入交互 | `manual` |
| 改动小、可自动推进修复或实现   | `auto`   |

- `manual`：使用 manual 模式; questing 和 to-issues 各在阶段结束时用户手动确认是否推进下一路径;
- `auto`：使用 auto 模式; 无须阶段确认；questing 和 to-issues由 agent 自动推进完成;
- 两者均遵循 `/code-delivery skill` 的 dev gate，复用用户已经确认的交付基线与授权；尚未确认时等待用户确认。

## 选择路径

先使用 `/domain skill` 建立或恢复 Plan；story、spec、notes 的维护始终必选。新任务进入 `/questing skill`；已有设计或 Plan 时，核对已完成步骤的产物与证据，从首个未完成步骤继续。

```text
domain 建立/恢复 Plan → questing
  ├─ 执行 to-issues → 实现切片写入 notes
  └─ 跳过 to-issues → 使用已有 notes
按 notes 的目标与依赖推进：讨论/调查/计划，或 code-delivery 实现
全过程通过 domain 实时维护 story、spec、notes → 全部 notes 完成
```

`/questing skill` 收敛后决定是否执行 `/to-issues skill`(manual 用户决定, 反之 agent 自动决定);

- 用户已指定执行或跳过时遵循其选择;
- 需要将实现拆成可独立验收、存在直接依赖的用户结果时，执行 to-issues；
- 已有合适工作粒度时跳过切片；跨会话恢复与持久化检查点由 domain 始终维护。

## 推进交付

- 讨论、调查和计划类 notes 按各自完成条件推进，需要澄清时使用 `/questing skill`。
- 实现类 notes 调用 `/code-delivery skill`，准入判断前完整读取 [QUESTIONS.md](extensions/QUESTIONS.md) 与 [workflows/README.md](extensions/workflows/README.md)，执行 `dev gate`。
- 交付中遇到阻塞时，优先查阅 workflows 索引与对应业务域 workflow；
- 每轮用户反馈、取证、决策、实现和验证后调用 `/domain skill` 就地同步；暂停或切换上下文前更新检查点，恢复时按 spec 的恢复入口继续。
