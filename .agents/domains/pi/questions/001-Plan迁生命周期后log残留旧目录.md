---
name: '001-Plan迁生命周期后log残留旧目录'
description: 'Plan 迁生命周期目录时若先建目标目录再逐文件搬，被 gitignore 的 log.jsonl 会留在旧路径，check 把它当 Plan 并报 spec.md 缺失。'
---

# Plan 迁生命周期后 log 残留旧目录

## 现象

`nano_flow_check`（脚本形态 `check-domain.mjs .`）报：

```text
.agents/domains/common/plans/active/2026-11-09-领域文档迁移至最新契约/spec.md: [missing] 文件不存在
```

但该 Plan 早已迁到 `archived/`，`active/` 下这个目录里只有一个 `log.jsonl`。

## 原因

- `.gitignore` 有 `.agents/domains/**/plans/**/log.jsonl`，轨迹文件不进版本库。
- 是否残留取决于搬法（2026-11-09 实测）：
  - `git mv <Plan目录> <目标生命周期目录>/`（目标父目录已存在，整个目录一起搬）：文件系统级 rename，被 ignore 的 `log.jsonl` 跟着走，**不留残留**。
  - 先建目标目录再搬内容（`mkdir plans/archived/X && git mv plans/active/X/* plans/archived/X/`，或逐文件搬）：只带走被跟踪的 `spec.md`、note、`notes_index.md`，`log.jsonl` 原地留下，旧路径变成「只有轨迹的目录」。
- 校验按目录名扫 Plan，看到目录就要求 `spec.md`，不会因为「只剩被忽略的文件」而跳过。

## 影响

- 全量 `nano_flow_check` 直接失败，dream 的收尾门禁（check 通过才 commit）失效；实测 dream 那次 check 没通过但仍提交了 `docs(dream): …`。
- 旧轨迹与新位置的真轨迹并存，读轨迹时容易把旧路径的段当成当前内容。

## 解决

1. 搬 Plan 首选 `git mv <Plan目录> <目标生命周期目录>/`（整个目录一起搬，轨迹跟着走，不会残留）。
2. 如果已经残留：先确认目标生命周期目录里已有完整副本（`spec.md`、note、`notes_index.md`、新的 `log.jsonl`）。
3. 再删掉只剩 `log.jsonl` 的残留目录。
4. 重跑校验确认 0 error。

搬 Plan 时顺手检查：`find .agents/domains -name log.jsonl` 的结果里，每个轨迹所在目录都应有 `spec.md`。

## 验证

- 2026-11-09：删掉 `common/plans/active/2026-11-09-领域文档迁移至最新契约/`（`archived/` 副本 519 KB 轨迹完整）后，`check-domain.mjs .` 返回 `领域文档校验通过`，工作区 `git status` 干净。
- 2026-11-09：把 `pi/plans/active/2026-11-09-pi-toolkit插件` 整体 `git mv` 到 `reference/`，3.8 MB 的 `log.jsonl` 随目录移动，`active/` 下无残留，校验通过。

## 来源

[015-定时触发dream](../plans/reference/2026-11-09-pi-toolkit插件/015-定时触发dream.md) 的真机验收。
