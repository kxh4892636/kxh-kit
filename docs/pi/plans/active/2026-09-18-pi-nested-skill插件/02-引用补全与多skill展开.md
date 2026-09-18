---
status: pending
blocked_by: ["01"]
---

# 引用补全与多 skill 展开

## 交付

在 pi 输入框中输入 `$`（任意位置）弹出 skill 选择 UI 并按 fuzzy 排序；一条输入可插入多个 `$skill-name`，提交时各自展开为 skill 正文，未知名（如 `$HOME`）原样保留。

## 范围

- `src/suggest.ts`：候选构造（`pi.getCommands()` 的 skill、去前缀、按 name 去重）、`fuzzyFilter` 打分、`$` 触发匹配与 `applyCompletion`。
- `src/reference.ts`：`$` token 解析、skill 表查找、按宿主 `/skill:` 同款的块展开。
- `src/index.ts`：接 `session_start` 注册 autocomplete provider；接 `input` 返回 `{action:"transform"}`。
- vitest 单测：候选去重与排序、触发边界（行首/空白后/行中/未命中）、`applyCompletion` 替换、多 token 展开、未知名保留、正文与 frontmatter 处理。
- 不包含真实网络/交互（真机证据在 Issue 03）。

## 直接依赖

- 01：包脚手架与扩展工厂；消费其 `package.json`、`src/discover.ts` 与 `src/index.ts` 的注册位。

## 验收

- [ ] `pnpm --filter @kxh4892636/pi-nested-skill test` 全部通过，增量覆盖率 >= 80%
- [ ] `pnpm --filter @kxh4892636/pi-nested-skill check` 通过
- [ ] 单测覆盖：`$` 在行首与空白后触发、`$` 在词中不触发、空查询返回全部、按 name 去重、fuzzy 排序稳定、`applyCompletion` 生成 `$name ` 且保留光标、多 token 展开、未知 `$word` 原样、`$` 后跟 `:`/`/` 不展开、正文含 `References are relative to <baseDir>.`
- [ ] 用 fake `pi` API 断言：未命中 `$` 语法时委托 `current.getSuggestions`；`input` 返回 `transform`

## 上下文

- [spec](../../spec.md)「实施决策 · `$` 补全 / `$` 展开」
- [ADR-0001](../../adr/0001-嵌套skill以扩展接缝交付.md)
- 补全参考：`.../pi-tui/dist/autocomplete.js`、`dist/fuzzy.js`
- 宿主展开形态：`.../pi-coding-agent/dist/core/agent-session.js` 的 `_expandSkillCommand`
- 用户消息示例：`.agents/skills/nano-flow/SKILL.md` 的嵌套 skill（本地）

## 下一步

/code-delivery

## 交付记录

待完成登记。
