---
name: '009-恢复已有Plan时只读的定案'
description: '恢复已有 Plan 时严格只读、报告后放行；轮转种子同步只读口径（4 项决定已确认）。'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 009-恢复已有Plan时只读的定案

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 现象

恢复或继续一个已有 Plan 时会自动选一条 note 执行。四处口径共同促成：

- `prompt.md:10`：`接续当前 Plan 的"继续""接着做"等指令 → do`。
- `prompt.md:125`：`核对已完成步骤, 从首个未完成步骤或可推进队列继续`。
- `src/nano-flow/tools/read.ts:190`：resume 输出 `从可推进队列选一条进入 do`。
- `src/nano-flow/rotate.ts:136-140`：轮转种子 `继续执行当前 Plan … 从可推进队列继续`。
- `src/nano-flow/skills/do/SKILL.md:8`：直接取 note。

2026-11-07 本会话复现：第一轮 `resume` → `ready` 后即开始查 `rotate.ts` 准备执行，与用户观察一致。

## 决定（2026-11-07，ask 第 1 轮，用户确认）

- 落点：固定提示词 `prompt.md` + 随包 ask/do skill + README，重新打包安装。
- 只读边界：恢复轮**严格只读**——不写 Plan（不经 `nano_flow_write`、不动任何文件）、不执行 note、不改状态、不改代码、不跑构建/测试/装包；只允许 `nano_flow_read`（plans / resume / notes / get / index / search / ready）、读文件与取证命令。
- 放行：恢复报告之后，用户的第一条后续消息即放行（进入 do）；那条消息若是新的澄清需求则按 ask。
- 轮转种子：改为「已轮转，只读恢复并报告，等用户放行」，新会话不自动执行。

## 行为契约

1. 触发：用户说「恢复」「继续」且本会话尚未加载该 Plan 时，走恢复步骤。
2. 只读动作：`resume` → 读 `spec.md` / `story.md` → 必要时读关键索引的 note → 报告目标、进度、可推进队列、阻塞项、下一步候选；本轮到此结束。
3. 本轮禁止：`nano_flow_write` 全部动作、`write` / `edit`、会改磁盘的命令、构建/测试/装包。
4. 放行后：按 do 循环从 `ready` 选 note；恢复轮零副作用，轮转或重启后重放安全。

## 改动点

- `prompt.md` 模式循环第 2 条：区分「恢复」与「执行」。
- `prompt.md` 的「恢复与轮转」：删「从首个未完成步骤或可推进队列继续」，改为只读报告 + 等放行。
- `src/nano-flow/tools/read.ts` resume 的「下一步」文案。
- `src/nano-flow/rotate.ts` 种子文案。
- `skills/do/SKILL.md`：入口先确认已放行。
- README 的恢复 / 轮转段落。

## 迁移前的证据
- ask 第 1 轮用户确认 4 项：落点 prompt.md + 随包 skill + README；严格只读（Plan 也不写）；报告后第一条后续消息放行；轮转种子改只读
- 锚点取证：prompt.md:10、prompt.md:125、src/nano-flow/tools/read.ts:190、src/nano-flow/rotate.ts:136-140、src/nano-flow/skills/do/SKILL.md:8
- 本会话复现：resume → ready 后即进入 rotate.ts 取证准备执行
