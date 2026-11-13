---
name: "004-学习skill与ponytail注入"
description: "learning skill 换成 pi 版（短句、电报体细则、实测分布、note-metrics.py），并注入 ponytail-audit 与 ponytail-review。"
status: completed
related_noted: ["001-提示词与模板照搬pi"]
next_step: "无；skill 列表在 007 真机确认"
---

# 004-学习skill与ponytail注入

## 目标

pi 在 11-10/11-11 对 learning skill 做了 6 轮迭代，并新增 ponytail 的两个 skill；dsh 侧仍是旧稿。

## 交付

- `skills/learning/SKILL.md` ← pi 版（64 行）：短句、电报体细则（`标签: 解释;`、半角、H2 问句）、每篇行数 / 条目字数 / 每节条数的实测分布。
- `skills/learning/scripts/note-metrics.py` ← pi 版（248 行），输出参考值与实测值，支持 `--detail`、`--json`、`--exclude`。
- `skills/ponytail-audit/`（`SKILL.md` + `agents/openai.yaml`，frontmatter `disable-model-invocation: true` 只可手调）与 `skills/ponytail-review/`（英文原文，来源 MIT）。
- `learning/ANKI.md` 的调用名改成 dsh 的 `/skill:nano-flow-cli` 形态（若 dsh 实际不认 `/skill:` 前缀则改回目录引用，以真机为准）。
- README 的 skill 列表同步。

## 验收

- skill 注册数量与名称正确；`ponytail-audit` 不出现在模型的自动选择列表。
- `python3 skills/learning/scripts/note-metrics.py <笔记目录>` 可跑。
- `vp test` 通过。

## 遗留

- ponytail 两个文件来自 MIT 项目，尚未写版权与许可声明；对外分发前需补 attribution（pi 侧同样遗留）。

## 交付记录（2026-11-13）

- learning/SKILL.md 换成 pi 版（短句、电报体细则、实测分布），新增 `scripts/note-metrics.py`（248 行）。
- 新增 `skills/ponytail-audit`（frontmatter `disable-model-invocation: true` + agents/openai.yaml）与 `skills/ponytail-review`；README 列表更新。
- 验证：`vp test` 的 skill 目录断言通过；装包后当前会话的可用 skill 列表出现 `ponytail-review`，`ponytail-audit` 不出现在自动选择列表。
- 遗留：ponytail 两个文件是 MIT 原文，尚未补版权与许可声明。

