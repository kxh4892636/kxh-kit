---
name: "003-搜索问题剥掉skill块"
description: "有 skill 展开时用户消息以 <skill …> 块开头，web_search 的 ori_question 于是变成 skill 样板文字而不是问题。复用 naming/name.ts 的剥离逻辑。"
status: completed
related_noted: []
---

# 003-搜索问题剥掉skill块

## 交付

- `naming/name.ts` 新增 `stripSkillBlocks(raw) → { text, skills }`，`namingInput` 改用它（会话命名与搜索问题从此同一份剥离逻辑）。
- `web/register.ts` 的 `messageText` 在拼接文本块后先剥 `<skill …>` 块，再交给 `boundQuestion` 截 128 字。

## 验收

- 消息里带展开的 skill 块时，`ori_question` 是用户自己写的那句话。

## 证据

- 本机会话文件里第一条用户消息就是 `<skill name="ponytail-audit" location="…">`，说明这条路径每天都在走。
- 新增测试（`web/register.test.ts`）用同样的展开形态断言 `ori_question` 为「pi 的 codemode 怎么开？」；旧实现下发出去的是 skill 块。
