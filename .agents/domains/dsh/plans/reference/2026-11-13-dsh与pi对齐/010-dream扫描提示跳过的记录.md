---
name: "010-dream扫描提示跳过的记录"
description: "scan 报告新增「需要留意」段：按 Plan 列出坏行、非 turn 记录、无效 turn 数量，用于发现格式不匹配。"
status: completed
related_noted: ["008-dream输入扫描改为脚本", "009-dream扫描改为工具"]
next_step: "无；随下次 dream 任务生效"
---

# 010-dream扫描提示跳过的记录

## 目标

用户问「非 dsh 格式的 log.jsonl（例如 pi 的 type:run）怎么处理」。原实现静默忽略，无法区分「真的没有新增」和「格式不认识」。按用户选择改为**提示但不报错**：同一 .agents 里 pi 与 dsh 轨迹可以共存。

## 交付

- `dream-scan.mjs`：坏行计数（JSON 解析失败或非对象）、非 turn 记录计数（`session` 以外）、无效 turn 计数（缺 sessionId 或 seq）；报告新增「需要留意（有记录被跳过）」段，JSON 结果新增 `warnings`。
- 提示语说明「可能不是 dsh 轨迹（例如 pi 的 run 记录）或格式已变；这些记录不会被处理」。
- 类型声明补 `DreamSkipped` / `DreamWarning`；新增一条单测覆盖 pi 格式 + 坏行。

## 验收

- 单测 370 项通过；`vp check` 通过。
- 用 pi 格式 fixture 实跑：输出「需要留意」并列出 `坏行 1、非 turn 记录 2、无效 turn 0`，JSON 的 `warnings` 同值。
- 不改变正常 dsh 轨迹的行为：无跳过时该段不出现。
