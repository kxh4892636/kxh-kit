---
name: "008-改回深色Tooltip气泡"
description: "用户改主意：悬浮提示换回宿主 Tooltip 的深色气泡（黑底白字），保留整行锚点与三字段内容。"
status: completed
related_noted:
  - "007-为Note面板增加三字段悬浮提示"
next_step: "已交付；气泡口径=宿主深色 Tooltip + 整行锚点，别再换 HoverCard。"
---

# 008-改回深色Tooltip气泡

用户回执：浅色卡片虽已铺满整行，但整体还是想用黑底白字。改回宿主 `Tooltip` 的深色气泡，保留 007 定下的整行锚点与三字段内容。

## 交付

| 项 | 结果 |
| --- | --- |
| 气泡 | 回到宿主 `Tooltip`（`label` = 三行文本，`side: top`、`delayMs: 200`、`portal: true`） |
| 锚点 | 仍是整行 `.dshtk-notes-row`，行悬停时标题提亮 |
| 清理 | 删掉 `HoverCard` 声明、测试替身与 `.dshtk-note-tip` 排版样式；宿主缺组件时仍退回原生 `title` |

## 验证

- `pnpm -C packages/dsh-toolkit test`：38 文件、337 项通过；`check` 格式/类型/lint 无告警。
- 面板用例断言 `[title]` 上是三行文本（描述 + 下一步 / 描述 + 原因 + 下一步），且锚点包含状态名。

## 验收

2026-11-09 15:3x 用户回执：0.5.44 上悬浮整行，气泡回到黑底白字，三行内容正常，本 note 置 `completed`。

## 相关

- [007-为Note面板增加三字段悬浮提示](007-为Note面板增加三字段悬浮提示.md) — 三字段与整行锚点的来源。