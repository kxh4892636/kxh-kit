---
name: "023-dream指令与自动化接入"
description: "新增 prompts/dream.md 作为自动化任务指令；nano-flow 预设挂载 schedule 工具；system.md 加 dream 入口与互链契约。"
status: completed
related_noted:
  - '019-dream机制设计'
  - '022-互链与check扩展'
---

# 023-dream指令与自动化接入

## 交付

- `prompts/dream.md`：完整 dream 指令（首行 `[nano-flow:dream]`；输入与游标、五 pass、写入边界、门禁、退出）。
- `prompts/system.md`：入口第 5 条——收到 `[nano-flow:dream]` 指令时按指令执行，不进入恢复或拷问。
- `preset.ts`：nano-flow 预设挂载 `@deepseek-ai/dsh-tool-schedule`，使 agent 能在 nano-flow 会话里创建定时任务。
- `README.md`：dream 与自动化任务说明。
- 0.5.30。

## 自动化任务配置（重启后由用户建）

- 标题 `nano-flow dream`；每天 08:00 Asia/Shanghai
  （`DTSTART;TZID=Asia/Shanghai:YYYYMMDDT080000` + `RRULE:FREQ=DAILY`，页面也可 cron `0 8 * * *`）。
- 目标「每次新建会话」；preset 选 nano-flow；指令 = `prompts/dream.md` 全文。
- 宿主需在 08:00 运行；错过的发生点只投最近一次；投递至少一次，dream 幂等。

## 验证

- 构建后 `dist/nano-flow/prompts/dream.md` 存在；preset 测试断言含 `dsh-tool-schedule`。
- `vp test src` 301 例通过；desktop / web profile 均 0.5.30。

## 遗留

- 任务尚未创建：需要用户明确要求，且要重启宿主载入 0.5.30 后创建（旧进程的预设还没有 `tool-schedule` 行）。