---
name: '005-ask-questions工具'
description: '新增独立的 ask_questions 模型工具：多题、选项、自定义回答与跳过；TUI 单组件切题与提交页，非交互降级，不引入 orchestrator 逻辑。'
status: 'blocked'
reason: '等待用户验收'
next_step: '打开 askQuestions 后在交互式会话让模型调用 ask_questions，验证切题、提交与未答拦截'
related_noted: ['004-toolkit开关面板与单一配置']
---

# ask_questions 工具

## 做法

- 从历史 `packages/pi-toolkit/src/orchestrator/ask.ts` 只取工具本体，落到 `src/ask/ask.ts`；没有引入 orchestrator 的状态、账本、派工、提示词、skill 或注册表。
- `src/ask/register.ts` 以 `defaultActive: false` 注册，交给新增的 `tools.askQuestions` 开关；`execute` 里再检查一次开关，关闭时给出可执行的错误提示。
- 激活集合由 `src/activation.ts` 的共享 `applyToolActivation` 对齐；web 工具的激活也改用它，行为不变。`session_start` 与每次 `/toolkit` 切换都会重新对齐。
- 工具参数：`questions[]`，每题 `question` 必填、`options` 最多 3 个（每个可带一行 `description`）、`allow_custom` / `allow_skip` 默认 true。`executionMode: "sequential"`，不与其他工具调用并行。
- TUI：一个组件管理全部题目。`←/→` 或 `Tab/Shift+Tab` 切题并恢复该题原选中位置；末题之后是独立的「提交」页，汇总各题答案；有题既未作答也未显式跳过时提交被拦下，跳到第一道未答题并列出其余题号。确认「自定义回答」会退出组件用 `ctx.ui.input` 取文本，再带同一份草稿重新进入；空输入留在原题，Esc 保留原答案。
- 非 TUI：rpc / print 退回逐题 `ctx.ui.select`（顺序问答、不能回退）；没有交互界面时不抛错，返回 `needs=answer` 的结构化登记。

## 证据

- `src/ask/ask.test.ts` 覆盖参数解析、候选项与概述渲染、切题/直选/提交页、未答拦截、自定义回答空值与取消、非交互降级与文本格式。
- `src/index.test.ts` 覆盖默认不激活、开关打开后进入激活集合、关闭时 `execute` 拒绝调用。
- `pnpm --filter @kxh4892636/pi-toolkit test`：199 项通过；`check` 无 lint / 类型问题。
