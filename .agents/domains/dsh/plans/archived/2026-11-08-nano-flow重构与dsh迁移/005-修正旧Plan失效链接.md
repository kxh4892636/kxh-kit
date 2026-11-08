---
name: "005-修正旧Plan失效链接"
description: "修正旧 Plan 里 119 条失效相对链接：可映射的重指新路径，死链降为纯文本。"
status: completed
reason:
related_noted:
  - '004-CONTEXT-MAP迁到.agents目录'
next_step: '等待用户验收；修正已提交'
---

# 005-修正旧Plan失效链接

## 背景

旧 Plan 从 `story/spec/notes.json` 迁到 `spec + note` 时，正文里的相对链接没有跟着改：notes 被放进 `plans/<lifecycle>/`，`adr` 编号从四位变三位并在根目录重建，`story.md` 并入 spec，`.flow/quest`、`.temp` 与若干 `packages/dsh-*` 已删除。扫描结果 119 条坏链（archived 74、reference 45）。

用户裁决：全修（含 archived），可映射的重指新路径，目标已消失的降为纯文本。

## 判定规则

1. 链接目标已存在 → 不动。
2. `adr/000N-*`：仅当 `adr/00N-*` 同标题存在时重指（旧 0002/0003 的决策已被新 002/003 取代，标题不同，按死链处理）。
3. 旧 note 编号（`0N-*` → `00N-*`）：加三位编号后目标存在则重指。
4. 其余按「0–4 级 `../` 前缀 / 0–3 级前缀剥离」枚举目标是否存在，命中唯一既有文件则重指（覆盖 `CONTEXT.md`、`CONTEXT-MAP.md`、`spec.md` 的层级错位）。
5. 以上都不成立 → 死链：只去掉 Markdown 链接语法，保留原文。

## 交付

- 一次性迁移脚本（不入库）改写 `plans/**` 下除生成物 `notes_index.md` 外的 markdown。
- 复扫到 0 坏链；`nano_flow_check` 通过；一个 commit。

## 验收

- 复扫：`plans/**` 手写文档坏链 0 条，且没有把原本有效的链接改坏。
- 抽查重指结果：ADR 按同标题映射、note 编号补齐、`CONTEXT-MAP.md` 指向 `../../../../CONTEXT-MAP.md`。

## 验证证据

- 全量扫描 183 条相对链接：64 条原本有效保持不动、46 条重指、73 条降为纯文本，覆盖 43 个文件。
- 重指样例：`../../adr/0004-…` → `../../../adr/004-…`；`../../archived/2026-09-08-…/02-…` → `../2026-09-08-…/002-…`；`packages/dsh-toolkit/README.md` 补一级 `../` 指到仓库根；`CONTEXT-MAP.md` 由三级补到四级。
- 死链样例：`story.md`（已并入 spec）、`.flow/quest/*`、`.temp/*`、`packages/dsh-keep-alive/*`、旧 ADR-0002/0003（决策已被新 002/003 取代，按编号重指会引向相反决策，故只保留文字）。
- 复扫 `.agents/domains/**` 全部 markdown：坏链 0 条（旧 `notes_index.md` 里 6 条陈旧链接随 `nano_flow_check` 重新生成消失）。
- `nano_flow_check` 通过。
