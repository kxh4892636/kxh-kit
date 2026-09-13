---
name: nano-flow
description: 启动或恢复开发任务时使用；选择 manual 或 auto 模式，串联需求与设计澄清、可选 issue 拆分、代码交付与领域文档校验。
---

# Nano Flow

## 选择模式

复用用户已有授权与模式偏好。尚未选择时，按工作性质采用下列模式并说明理由；
选择模式的优先级高于 questing 和 to-issues 内部约束的优先级;

| 工作性质                       | 模式     |
| ------------------------------ | -------- |
| 改动大、需要用户介入与深入交互 | `manual` |
| 改动小、可自动推进修复或实现   | `auto`   |

- `manual`：故事逐轮由用户回答，设计草案由用户统一审阅；questing 和 to-issues 各在阶段结束时确认一次，已有明确确认直接复用。
- `auto`：agent 根据证据回答问题、评价草案并推进，无须阶段确认；缺少必须由用户提供的信息或授权时，仅暂停依赖它的工作。

## 选择路径

新任务从 `/questing skill` 开始；已有设计或 Plan 时，核对已完成步骤的产物与证据，从首个未完成步骤继续。

```text
questing
  ├─ 执行 to-issues → 按依赖逐个 code-delivery → 全部 Issue 完成
  └─ 跳过 to-issues → code-delivery → 完成
```

`/questing skill` 收敛后决定是否执行 `/to-issues skill`(manual 用户决定, 反之 agent 自动决定);

- 用户已指定执行或跳过时遵循其选择;
- 需要跨会话恢复、持久化检查点或有依赖的分批交付时，执行 to-issues；
- 范围明确、可在当前会话完成且不需要 Issue 图时，跳过 to-issues。

## 推进交付

- 调用 `/code-delivery skill`，准入判断前完整读取 [QUESTIONS.md](extensions/QUESTIONS.md) 与 [workflows/README.md](extensions/workflows/README.md), 执行 `dev gate`：
- 交付中遇到阻塞时，优先查阅 workflows 索引与对应业务域 workflow；
- 所有任务执行完成后, 从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`;
