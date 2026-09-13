---
name: nano-flow
description: 进入、恢复或推进从故事与设计、可选 issue 拆分到代码交付的 Flow，或判断下一步 skill 时使用。
---

# Nano Flow

## 选择模式

复用用户已有授权与模式偏好。尚未选择时，列举两个模式, 按工作性质推荐并说明理由:

| 工作性质                       | 模式     |
| ------------------------------ | -------- |
| 改动大、需要用户介入与深入交互 | `manual` |
| 改动小、可自动推进修复或实现   | `auto`   |

- `manual`：`/questing skill` 和 `/to-issues skill` 结束后需要用户一次确认, 确认后继续推进路径。
- `auto`：`/questing skill` 和 `/to-issues` 完全由 agent 自动推进, 无须用户确认。

## 选择路径

新任务从 `/questing skill` 开始；已有设计或 Plan 时，核对已完成步骤的产物与证据，从首个未完成步骤继续。

```text
questing
  ├─ 执行 to-issues → 按依赖逐个 code-delivery → 全部 Issue 完成
  └─ 跳过 to-issues → code-delivery → 完成
```

`/questing skill` 收敛后决定是否执行 `/to-issues skill`(manual 用户决定, 反之 agent 自动决定);

- 用户已指定执行或跳过时遵循其选择;
- 需要跨会话恢复、持久化检查点或有依赖的分批交付时;
- 范围明确、可在当前会话完成且不需要 Issue 图时;

## 推进交付

- 调用 `/code-delivery skill`，准入判断前完整读取 [QUESTIONS.md](extensions/QUESTIONS.md) 与 [workflows/README.md](extensions/workflows/README.md), 执行 `dev gate`：
- 交付中遇到阻塞时，优先查阅 workflows 索引与对应业务域 workflow；
- 所有任务执行完成后, 从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`;
