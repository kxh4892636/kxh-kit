---
name: "008-模板与README对齐规则"
description: "note 模板自带只有 blocked 才能写的 reason:，README 的随包 skill 清单少了 ponytail-audit 与 ponytail-review。两处按实际规则与目录改正。"
status: completed
related_noted: []
---

# 008-模板与README对齐规则

## 交付

- `templates/note.md` 删除 `reason:` 一行：规则是「blocked 才写 reason」，新建的 pending note 不该带这个键。
- README 的 Nano Flow「Skills」清单补上 `ponytail-review` 与 `ponytail-audit`，与 `src/nano-flow/skills/` 的 7 个目录一致。

## 验收

- 新建 note 没有空 `reason`；README 与实际贡献的 skill 目录一致。

## 证据

- `ls packages/pi-toolkit/src/nano-flow/skills`：ask、code-spec、do、learning、ponytail-audit、ponytail-review、to-skill（7 个）。
- 本 Plan 的 10 条 note 已按新模板去掉空 `reason`，`nano_flow_check` 通过。
