---
name: nano-flow
description: 启动或恢复开发任务时使用；选择 manual 或 auto 模式，持续维护必备 Plan 文档，串联逐轮拷问、可选垂直切片与代码交付。
---

# Nano Flow

## 选择模式

复用用户已有授权与模式偏好；尚未选择时，按工作性质采用下列模式并说明理由，各 skill 的确认点见其 `## 模式`：

| 工作性质                       | 模式     |
| ------------------------------ | -------- |
| 改动大、需要用户介入与深入交互 | `manual` |
| 改动小、可自动推进修复或实现   | `auto`   |

- 两个模式均在 `/code-delivery skill` 的 dev gate 停止, 并等待用户手动确认;

## 选择路径

使用 `/domain skill` 建立或恢复 Plan 并实时更新维护。新任务进入 `/questing skill`, 收敛后决定是否执行 `/to-issues skill`(manual 用户决定, 反之 agent 自动决定); 已有设计或 Plan 时，核对已完成步骤，从首个未完成步骤继续。

同一 session 默认只有一个 Plan：用户未明确指定新建时，新输入作为 note 追加到当前 Plan，不因命名或主题偏差另建；notes 累积使主题偏移后重命名该 Plan。

to-issues 跳过原则:

- 用户已指定执行或跳过时遵循其选择;
- 需要将实现拆成可独立验收、存在直接依赖的用户结果时，执行 to-issues, 反之跳过

## 推进交付

- 讨论、调查和计划类 notes 按各自完成条件推进，需要澄清时使用 `/questing skill`。
- 实现类 notes 调用 `/code-delivery skill`，准入判断前读取 common 和业务域 QUESTIONS.md 和 workflow, 执行 `dev gate`。
- 交付中遇到阻塞时，优先查阅 common 和业务域 QUESTIONS.md 和 workflow；
- 每轮用户反馈、取证、决策、实现和验证后调用 `/domain skill` 就地同步；暂停或切换上下文前更新检查点，恢复时按 spec 的恢复入口继续。
