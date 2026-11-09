---
name: '006-定时dream由系统定时器加RPC客户端触发'
description: 'dream 定时触发放在宿主侧：systemd user timer 调 wrapper，wrapper 用 pi --mode rpc 发 /dream；dream 自身仍无定时器，print 模式不可用。'
status: 'accepted'
---

# 定时 dream 由系统定时器加 RPC 客户端触发

## 背景

[ADR 004](004-dream由命令手动触发且不依赖seq游标.md) 当时决定「只暴露 `/dream`，不做定时、不做后台环」，理由是 pi 没有 Schedule 接缝、进程生命周期不保证常驻。

2026-11-09 需求改为每天定时跑。要在不动 dream 内部实现的前提下满足它，必须先确定「谁能把 `/dream` 送到一个活着的 pi 会话里」。实测（[015](../plans/active/2026-11-09-pi-toolkit插件/015-定时触发dream.md)）：

- print / json 模式不行：扩展命令 handler 返回后进程即 dispose，命令里 `pi.sendUserMessage()` 起的 run 被丢掉（1 ms resolve、零事件、无会话文件）。
- RPC 模式可行：`prompt` 响应 `disposition: handled` 后真实起 run 并跑到 `agent_settled`；`ctx.ui.notify` 以 `extension_ui_request` 事件出现在 stdout，可落日志。

## 决策

- **触发在宿主侧**：systemd user timer 每日调一个 wrapper 脚本；wrapper 用 `pi --mode rpc` 起会话、写一行 `prompt: /dream`、等 `agent_settled`、关 stdin 退出。dream 自身仍不建定时器、不留游标。
- **单飞与预检在 wrapper**：`flock` 防重叠，`git status --porcelain` 为空且 `.agents/domains` 存在才起会话（省会话成本；dream 内部同一检查保留为语义门禁）。
- **清单驱动**：一个清单文件列出目标目录，串行逐个跑。
- **失败不重试**：错误进 wrapper 日志与 unit 状态，靠人看。
- **只走 RPC**：配置与代码不承诺 print / json 模式能触发扩展命令里的 run。

## 已排除的备选

- **crontab**：本机可用，但没有补跑（错过的时间点直接丢）、PATH 需手写、日志要自己重定向；systemd user timer 三项都免费。
- **print 模式 + 自造 dream 提示词**：复用 `selectDreamScope` / `buildDreamMessage` 打印文本再 `pi -p`，能跑，但绕开 `/dream` 的门禁与 `nano-flow-dream` 记录，且 notify 在 print 模式被吞，失败不可见。
- **给扩展加 `--dream` flag 在 `session_start` 里发消息**：仍受 print 模式 dispose 影响，还得自己实现「等 `agent_settled` 再退」，与 wrapper 等价但把宿主职责塞进扩展。
- **在扩展内建定时器 / 后台常驻**：pi 进程生命周期不保证常驻，与 ADR 004 的排除理由一致。
- **tmux 里发按键给交互会话**：依赖终端会话存活与屏幕解析，最脆。

## 与既有决策的关系

与 ADR 004 的「触发」一条冲突，重新讨论的理由是需求从「手动一次」变成「每日定时」，而 004 对触发之外的结论（范围、按目录名取最新 N 个、无游标全量幂等、dream 自己 check + `docs(dream): …` 提交、GUIDE 由 dream 维护）继续有效，因此不改 004 的其余条目，只新增本 ADR 并回指。

## 相关

- [004-dream由命令手动触发且不依赖seq游标](004-dream由命令手动触发且不依赖seq游标.md) — 本决策只替换其「触发」条，其余结论仍有效。
- [015-定时触发dream](../plans/active/2026-11-09-pi-toolkit插件/015-定时触发dream.md) — 实现路径、wrapper 设计、unit 模板与验收条件。
