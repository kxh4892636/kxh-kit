---
name: '004-会话模式与Plan绑定'
description: '用会话条目保存 nano-flow-mode 与 nano-flow-binding；/nano-flow 开关与 nano_flow_bind 是唯一写入方。'
status: 'blocked'
reason: '等待用户验收'
next_step: '绑定 Plan 后重启会话，确认侧栏与 seed 仍指向同一 Plan'
related_noted: []
---

# 会话模式与 Plan 绑定

## 交付

- `mode.ts`：`sessionModeOf`、`bindingOf`、`latestResetAt`、`isNanoFlowActive`、`buildSeed`。
- `nano_flow_bind`：按 plan/domain/lifecycle 解析，`pi.appendEntry("nano-flow-binding", { planPath, cwd, boundAt })`；最后一条生效；不再有全局绑定表。
- 侧栏与 seed 都从绑定条目读当前 Plan；目录失效时按 cwd 回退，仍失效则侧栏隐藏、seed 要求重新确认 Plan。

## 验收

绑定后重启/恢复会话仍有效；切换 Plan 后侧栏跟随；绑定条目不出现在模型上下文。


## 结果

- 已实现并通过 `pnpm --filter @kxh4892636/pi-toolkit test`（220 项）与 `check`。
- 真机冒烟：`nano_flow_create` 建 domain/plan、`nano_flow_bind` 写会话条目、rotateAt=0.0001 产生 `nano-flow-reset` 均已在 pi 1.5.0 验证。
- fullscreen 侧栏与 `/nano-flow` 选择器留待用户验收。
