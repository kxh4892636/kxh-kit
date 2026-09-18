---
status: pending
blocked_by: []
---

# 嵌套 skill 发现实现

## 交付

安装 `@kxh4892636/pi-nested-skill` 后，被上层 `SKILL.md` 截断的嵌套 skill（如 `nano-flow/references/skills/*/SKILL.md`）进入 pi 的系统提示与 `pi.getCommands()`，与顶层 skill 同权。

## 范围

- 包脚手架：`package.json`（`pi.extensions` 指向 `./src/index.ts`、peer/dev 依赖）、`tsconfig.json`、`vite.config.ts`、`.gitignore`、`README.md`。
- `src/discover.ts`：根解析（`getAgentDir()/skills`、`~/.agents/skills`、cwd 上溯 `.pi/skills` 与 `.agents/skills`、已知 skill 目录、trust 语义）、递归遍历与剪枝、隐藏判定、去重排序。
- `src/index.ts`：扩展工厂，接 `resources_discover` 返回隐藏 skill 目录。
- vitest 单测（临时 fixture 目录驱动）。
- 不包含 `$` 补全与 `input` 展开（Issue 02）与安装（Issue 03）。

## 直接依赖

无（根 Issue）；以 [ADR-0001](../../../adr/0001-嵌套skill以扩展接缝交付.md) 与 [spec](spec.md)「实施决策 · 发现」为约束。

## 验收

- [ ] `pnpm --filter @kxh4892636/pi-nested-skill test` 全部通过，增量覆盖率 >= 80%
- [ ] `pnpm --filter @kxh4892636/pi-nested-skill check` 通过
- [ ] 单测覆盖：顶层含 `SKILL.md` 时其深层子目录被判隐藏、普通多层 `SKILL.md` 被判可见、`node_modules`/隐藏目录/排除清单被剪除、符号链接目录不跟随、已知 skill 目录之下恒为隐藏、结果按真实路径去重与排序、项目根在未受信时不参与
- [ ] 用 fake `pi` API 驱动扩展工厂，断言 `resources_discover` 返回 `skillPaths` 且元素为含 `SKILL.md` 的目录

## 上下文

- [spec](spec.md)
- [ADR-0001](../../../adr/0001-嵌套skill以扩展接缝交付.md)
- [CONTEXT](../../../CONTEXT.md)
- [quest 设计记录](../../../../../.flow/quest/2026-09-18-pi插件.md)
- pi 发现规则：`.../pi-coding-agent/dist/core/package-manager.js` 的 `collectSkillEntries`、`dist/core/skills.js` 的 `loadSkillsFromDirInternal`
- DSH 同类实现：`packages/dsh-nested-skill/src/{provider,boundary}.ts`（本地）

## 下一步

/code-delivery

## 交付记录

待完成登记。
