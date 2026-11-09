---
name: '007-提示词与skill注入'
description: '在 Nano Flow 会话注入固定提示词、GUIDE 快照、篇幅限制与每轮提醒；随包 skill 按会话通过 resources_discover 注入。'
status: 'completed'
related_noted: []
---

# 提示词与 skill 注入

## 交付

- 复制并适配 `system.md` / `user.md` / `limit.md`：`ask_user_question` → `ask_questions`，轮转段改成「清空上下文 + seed」，去掉 PTC 与宿主插件表述。
- `before_agent_start` 把固定提示词 + GUIDE 快照 + 限制值写进 `systemPromptOptions.sections`；用户消息触发的 run 追加 `user.md` 提醒。
- `resources_discover` 仅在当前会话生效时返回 `nano-flow/skills` 根。
- 5 个 skill：ask / do / to-skill / code-spec / learning；ask / do 中的 subagent 段落改为当前 agent 自查，其余保留。

## 验收

普通会话看不到 nano-flow skill；Nano Flow 会话能看到 5 个 skill；开关关闭后提示词与提醒消失；`/nano-flow on` 中途打开时提示 skill 需 `/reload`。


## 结果

- 已实现并通过 `pnpm --filter @kxh4892636/pi-toolkit test`（220 项）与 `check`。
- 真机冒烟：`nano_flow_create` 建 domain/plan、`nano_flow_bind` 写会话条目、rotateAt=0.0001 产生 `nano-flow-reset` 均已在 pi 1.5.0 验证。
- fullscreen 侧栏与 `/nano-flow` 选择器留待用户验收。
