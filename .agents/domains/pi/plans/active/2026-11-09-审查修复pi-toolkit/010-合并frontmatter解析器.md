---
name: "010-合并frontmatter解析器"
description: "侧栏 notes.ts 与校验脚本 base.mjs 各有一个 YAML 头解析器，规则会各改各的。保留 base.mjs 的实现，notes.ts 改为复用。"
status: completed
related_noted:
  - 007-删除不可达CLI与重复渲染
---

# 010-合并frontmatter解析器

## 交付

- `notes.ts` 删除本地解析（`indexOf("\n---")` + `yaml`），改用 `check-domain.mjs` 转出的 `parseFrontmatter`，`kind === "ok"` 才取 `data`。
- YAML 头解析只剩 `lib/base.mjs` 一处；扩展侧通过 `check-domain.d.mts` 拿到类型。

## 验收

- 侧栏读到的 note 头与校验脚本看到的是同一份解析结果。

## 证据

- `ui.test.ts`、`core.test.ts` 全绿；`pnpm check` 类型通过（`FrontmatterResult` 判别联合）。
