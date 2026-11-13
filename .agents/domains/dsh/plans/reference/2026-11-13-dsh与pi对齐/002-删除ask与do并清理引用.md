---
name: "002-删除ask与do并清理引用"
description: "删除随包 ask/do 两个 skill，并清理预设 persona、描述、README 与测试里对这两个循环的引用。"
status: completed
related_noted: ["001-提示词与模板照搬pi"]
next_step: "无；skill 目录与入口路由已在 007 真机确认"
---

# 002-删除ask与do并清理引用

## 目标

跟随 pi：`1da5904` 删除了 `skills/ask` 与 `skills/do`，且没有替代 skill；dsh 同步删除，流程规则只由 system/user 提示词与模板承担。

## 交付

- 删除 `src/nano-flow/skills/ask/`、`src/nano-flow/skills/do/`。
- `preset.ts`：persona 前缀去掉「按固定提示词里的 ask / do 两个循环推进」，改为不依赖 skill 的表述；预设 `description` 去掉「ask 拷问、do 交付」。
- `README.md` 的随包 skill 列表、`dsh/CONTEXT.md` 的相关词条同步。
- 测试：删除或改写断言 ask/do 存在、skill 数量、入口路由的用例。

## 验收

- 包内 `skills/` 只剩 code-spec、learning、ponytail-audit、ponytail-review、to-skill。
- `vp test` 通过；重新安装后 nano-flow 会话的 skill 目录不再出现 ask/do。

## 影响

- 本工作区后续的 nano-flow 会话不再有 `/ask`、`/do` skill；当前会话已加载的内容不受影响。
- 现有 Plan 里「按 /ask skill 推进」的措辞会指向不存在的 skill，由 dream 在晋升时统一。

## 交付记录（2026-11-13）

- 删除 `skills/ask`、`skills/do`；`preset.ts` 的 persona 与 description 去掉 ask/do 循环；README 的 skill 列表与嵌套示例同步。
- 验证：包内 skills 只剩 code-spec / learning / ponytail-audit / ponytail-review / to-skill；装包后当前会话的 skill 目录已不含 ask/do（宿主 skill provider 每次 list 重读目录）。
- 影响：本工作区后续会话不再有 `/ask`、`/do` skill。

