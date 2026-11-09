---
name: "010-单会话复用绑定Plan的规则"
description: "会话内默认所有内容都追加到当前绑定的 Plan；新建 Plan 必须先得到用户显式确认。"
status: completed
related_noted:
  - "009-调研Plan写入现状与惰性化取舍"
next_step: "改固定提示词的「建 Plan」段并同步 skill 口径，装包后核对注入文本。"
---

# 010-单会话复用绑定Plan的规则

用户定规则：**除非用户显式说明，一个会话里的内容都复用当前绑定的 Plan；即使要新建 Plan，也必须先经用户确认。**

## 现状

固定提示词「建 Plan」段现在是：「当前域没有 active 的 Plan，或用户提出与当前 Plan 无关的新目标时，用 `nano_flow_create` 的 `kind=plan` 建 Plan，建好后调用 `nano_flow_bind` 绑定本会话；否则新输入作为 note 追加到当前 Plan。」

也就是 agent 可以**自主**判定「目标无关」并新建 Plan。本会话就发生过三次：绑定收口、Note 面板、写入节奏各建一个 Plan，最后由用户要求合并成 `2026-11-09-nano-flow优化迭代`。

## 新规则

- 默认动作：把新输入写成**当前绑定 Plan** 的一条 note（或并入已有 note），不新建 Plan。
- 新建 Plan 的前置：先向用户说明理由并取得显式同意；未获同意前只能追加 note。
- 没有绑定时（新会话首轮）仍按恢复/绑定流程走：先 `nano_flow_bind` 到目标 Plan，再决定是否追加 note。

## 落点

- `src/nano-flow/prompts/system.md` 的「建 Plan」段：改成上面的默认动作 + 确认前置。
- `skills/do`、`skills/ask` 不重复这条规则，只引用固定提示词，避免两处定义。
- `GUIDE.md` 属 dream 专属写入，本轮不动；要进快照由 dream 晋升。

## 验收

- 源码与 `dist/nano-flow/prompts/system.md` 都含新句。
- 行为上：后续同类新目标先追加 note，需要新 Plan 时先问用户。

## 安装记录

2026-11-09 15:2x：随 `0.5.44` 一起装进 web profile。核对：安装副本版本 `0.5.44`、`dist/nano-flow/prompts/system.md` 含「新建 Plan 必须先得到用户显式确认」1 处；`dist/client.js` 已无 `HoverCard`、仍含 `dshtk-notes-row`（008 的回退同批生效）。

当前会话仍挂着 0.5.43 的注入文本，新规则对新会话/重启后的会话生效。

## 相关

- [009-调研Plan写入现状与惰性化取舍](009-调研Plan写入现状与惰性化取舍.md) — 同属「少写、少建」的收口方向。