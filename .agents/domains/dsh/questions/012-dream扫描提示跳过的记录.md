---
name: '012-dream扫描提示跳过的记录'
description: 'scan 报告的「需要留意」大多来自 pi 的 run 轨迹：dsh 只解析 type:turn，pi 记录整份被跳过，不算损坏。'
---

# 012-dream扫描提示跳过的记录

## 现象

`nano_flow_dream` 的 scan 输出末尾出现：

```text
## 需要留意（有记录被跳过）
- .agents/domains/pi/plans/reference/…：坏行 0、非 turn 记录 30、无效 turn 0
```

每次 dream 都会出现，看起来像日志坏了。

## 原因

扫描只把 `type: "turn"` 的行当对话（`type: "session"` 是段头，JSON 解析失败记坏行）。pi 的 `log.jsonl` 是另一种格式：每 `run` 一行、内容在 `entries` 里，于是整份都被记成「非 turn 记录」。这是格式不同，不是损坏。

## 处理

- 落在 `pi` 域的 Plan 一律忽略：pi 的 dream 由 `/dream` 全量跑，不用 seq 游标（[pi 004](../../pi/adr/004-dream由命令手动触发且不依赖seq游标.md)）。
- 同一段出现在 `dsh` 域的 Plan 上才需要查：说明轨迹被别的实现写过或格式已变，先看该 log 首行的 `type` 与键名。

## 验证

- 用 `bash` + python3 打首行：pi 是 `run` + `entries`，dsh 是 `session` / `turn`。
- 无跳过时该段不出现。

## 相关

- [010-dream扫描提示跳过的记录](../plans/reference/2026-11-13-dsh与pi对齐/010-dream扫描提示跳过的记录.md) — 「需要留意」段的实现与口径。
- [011-dream如何读轨迹细节](../plans/reference/2026-11-13-dsh与pi对齐/011-dream如何读轨迹细节.md) — 两种格式分别怎么读。
