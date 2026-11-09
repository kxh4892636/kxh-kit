---
name: '015-定时触发dream'
description: '用 systemd user timer 加 RPC 客户端每日在清单目录跑 /dream；print 模式实测空转，wrapper 负责锁、干净预检、超时与日志。'
status: 'completed'
related_noted: ['013-dream手动维护命令', '014-Plan轨迹落盘']
---

# 定时触发 dream

## 需求

2026-11-09：用 Linux 定时任务，每天在指定时间、对指定目录启动 pi 会话并触发 `/dream`。

## 取证：print 模式空转（反证）

`/dream` 是扩展命令，handler 里 `pi.sendUserMessage()` 起一轮 run 后立刻返回。因此看「能不能用 `pi -p "/dream"`」必须先验证 print 模式会不会等这一轮跑完。

探针（`/tmp/dream-probe/`，不留在仓库）：注册一个只做 `await pi.sendUserMessage("Reply with exactly: PTIME-OK")` 的命令，在 print 模式下运行。

- `await` 版 1 ms 就 resolve（`pi … /ptime` 打印 `ptime: resolved after 1ms`），随后 `agent_settled` 触发、进程 dispose。
- 没有 assistant 输出、`--mode json` 除会话头外零事件、会话目录没有生成 jsonl。
- `-ne`（不加载 pi-toolkit）复现同样结果，所以不是本包引入的问题，而是 print 模式在「命令已 handled」后直接退出，把延后执行的 run 丢掉。
- 对照：`pi --print "Reply with exactly: PLAIN-OK"` 正常输出 `PLAIN-OK`，说明普通 prompt 在 print 模式没问题。

结论：**cron / timer 里写 `pi -p "/dream"` 不会真的跑 dream**。

## 取证：RPC 模式可用

同机 `pi --mode rpc`（1.5.0），向 stdin 写一行：

```json
{"id":"1","type":"prompt","message":"/dream"}
```

- 响应 `{"id":"1","type":"response","command":"prompt","success":true,"data":{"disposition":"handled"}}`，随后事件流真实开始：`agent_start` → `turn_start` → … → `agent_end` → `agent_settled`（`aborted:false`）。
- 同一探针在 RPC 下 `sendUserMessage` 1 ms resolve 后仍在 ~1 s 后真正起 run 并回出 `PTIME-OK`，说明只有 RPC 的常驻进程能让延后的 run 跑完。
- 无 TTY 下 `/dream` 的门禁与提示都工作：在临时仓库 `git init` 后跑裸 `/dream`，`ctx.ui.notify` 变成 stdout 上的 `extension_ui_request`：`{"method":"notify","message":"dream：`.agents/domains` 下没有 active / reference 的 Plan。","notifyType":"warning"}`。print 模式没有这条通道，失败原因会被静默吞掉。
- 优雅退出 = 关闭 stdin（`docs/rpc.md` 第 93 行「Close the child's stdin to request an orderly shutdown」）。

## 取证：环境事实

- `cron` 服务 active（`/usr/bin/crontab` 可用）；systemd user 会话 running、`Linger=yes`，已有 `botmux-watchdog.timer` 在跑 —— 两种调度器都可用。
- `pi` 在 nvm 下：`/data00/home/kongxiaohan.xiaoyu/.nvm/versions/node/v24.19.0/bin/pi`；定时任务的默认 PATH 里没有它。
- `~/.pi/agent/pi-toolkit.json` 已是 `tools.nanoFlow: true` + `nanoFlow.always: true` —— 新会话（无模式条目）默认 Nano Flow 生效，这是 `/dream` 前两道门能过的前提。
- `~/.pi/agent/trust.json` 已信任 `/data00/home/kongxiaohan.xiaoyu/projects`，不需要 `-a`。
- Note 侧栏判 `mode !== "tui"` 直接不启用（`ui/sidebar.ts`），RPC 下无噪音。
- 一次运行的范围：`.agents/domains` 7 个域、15 个 active/reference Plan（每域上限 `dreamMaxPlansPerDomain` = 21）。

## 第 1 轮

#### Q1 — 定时器

- 问题：systemd user timer / crontab / 两者都给示例。
- 推荐答案及理由：systemd user timer —— `Linger=yes` 已在，`Persistent=true` 能补跑错过的日子，日志进 journald，环境变量显式可控。
- 处理结论：已确认，用 systemd user timer。

#### Q2 — 触发方式

- 问题：RPC 包装脚本 / print + 自造 dream 提示词 / 只出方案不动代码。
- 推荐答案及理由：RPC 包装 —— 完全复用 `/dream` 的四道门、范围选择与 `nano-flow-dream` 记录；print 方案要复制门禁逻辑且失败不可见。
- 处理结论：已确认，走 RPC 包装脚本。

#### Q3 — 目标目录

- 问题：只跑 kxh-kit / 多目录清单 / 每仓库一份 unit。
- 推荐答案及理由：多目录清单 —— 用户明确要「指定目录」，清单比散落多份 unit 好维护。
- 处理结论：已确认，多目录清单。

#### Q4 — 模型与失败处理

- 问题：沿用默认模型 + 失败只记日志 / 换成更强模型 + 重试一次 / 模型由 unit 传参。
- 推荐答案及理由：沿用默认（`deepseek-flash`）+ 失败只记日志；重试会与 dream 自己的 `git commit` 叠加出意外状态。
- 处理结论：已确认。

## 决策

1. 触发留在 dream 之外：dream 自身仍无定时器、无游标（沿用 [ADR 004](../../../adr/004-dream由命令手动触发且不依赖seq游标.md) 的范围、幂等与收尾结论），定时由系统定时器 + RPC 客户端完成（[ADR 006](../../../adr/006-定时dream由系统定时器加RPC客户端触发.md)）。
2. 客户端只在 RPC 模式下工作；不碰 print / json 模式。
3. 清单驱动：一个清单文件列出目标目录，脚本逐个串行跑，单飞锁防重叠。
4. 失败不重试，靠日志与 unit 状态暴露。

## 落点（2026-11-09 用户指定）

脚本与清单放在**工作区**，不进 pi-toolkit 包：

- `script/dream-daily.mjs`：RPC 客户端。`--targets`（默认同目录 `dream-targets.json`）、`--only`、`--pi`、`--timeout`（分钟，默认 90）、`--dry-run`。
- `script/dream-targets.json`：`{ "targets": [ { "cwd": … , "model": …? } ] }`；首个目标 `/home/kongxiaohan.xiaoyu/projects/kxh-workspace`。
- `script/systemd/pi-dream.service` 与 `pi-dream.timer`：软链到 `~/.config/systemd/user/`。
- 日志与锁在仓库外：`~/.pi/dream/logs/<date>.log`、`~/.pi/dream/dream.lock`（放进仓库会让 preflight 永远不干净）。

## 实现要点

- **预检**：目录存在 → `.agents/domains` 存在 → 是 git 仓库 → `git status --porcelain` 为空；任一不过就跳过并记原因，不起会话。
- **单飞**：`O_EXCL` 建锁文件写 pid；持锁进程已死则接管锁。同日同目录复用会话 id `dream-<date>-<目录名>`。
- **结束判定**：`agent_settled` 即成功；出现 `warning`/`error` 的 notify 且 3 s 内没有 `agent_start` 判为门禁拒绝（skipped）；90 min 未收敛判 timeout；进程提前退出判 failed。关 stdin 后 30 s 不退则 SIGKILL。
- **退出码**：0 成功｜1 失败/超时｜3 全部跳过｜4 已有实例。
- **踩坑**：`finish()` 里设的 SIGKILL 定时器在子进程已退出后没清掉，事件循环被它多吊 30 s（跳过路径实测 33 s）；退出时统一清理后才降到 3.4 s。

## 暂定默认（可改，不阻塞）

- 时间：每日 08:00（`Persistent=true` 补跑，`RandomizedDelaySec=300`）。
- 会话：默认 session dir；同日重跑接同一会话。
- 环境：`PATH` 显式带 nvm bin（`node` 只在那里）、`PI_SKIP_VERSION_CHECK=1`、`HOME` 显式给。

## 验收（2026-11-09，真机）

1. `systemctl --user list-timers` 显示 `pi-dream.timer`，下次 `Tue 2026-11-10 08:01:32 CST`。
2. 分项自测：`--dry-run` 正确报出「工作区有未提交改动（1 项）」；临时仓库 `/tmp/dream-scratch` 走到 skipped 并记下门禁原文；活 pid 的锁挡下第二次运行（exit 4），死 pid 的锁被接管（exit 3）。
3. 真机：`systemctl --user start pi-dream.service`，12:04:21 → 12:08:07（约 3.7 min）以 `ok` 收尾；工作区仓库出现 dream 自己的提交 `c0f9f47 docs(dream): common/ecomcli/experience-score/flagship-evaluation/funding 领域文档维护`（11 个文件 +275/−2），`GUIDE.md` 从 0 字节写成 5737 字节。
4. 复核：`check-domain.mjs .` 在清理下述残留后 0 error；工作区 `git status` 干净。

## 发现：Plan 迁生命周期后 `log.jsonl` 留在旧目录

真机跑完才暴露：`common/plans/active/2026-11-09-领域文档迁移至最新契约/` 只剩一个被 gitignore 的 `log.jsonl`（该 Plan 早已迁 `archived`），`check-domain.mjs` 会把它当 Plan 并报 `spec.md: [missing]`，dream 那次 check 因此没通过却仍提交了。处置：删掉残留目录后 check 通过。这条与修法记在 [问题 001](../../../questions/001-Plan迁生命周期后log残留旧目录.md)。

## 未决与风险

- **自动 commit 与人工改动撞车**：dream 收尾自己 `git commit`；靠干净预检 + 时段规避，不做自动 stash。
- **preflight 与 dream 门禁重复**：wrapper 先查 git 干净是为了省一次会话成本；dream 内部仍会自查，两处都在是刻意冗余。
- 清单里目录若长期失败（例如常驻脏工作区），只有日志可见，没有告警通道；是否接通知（飞书等）留待需要时再定。

## 后续候选（未做）

- 定时只跑工作区根这一棵树；kxh-kit 自己的 `.agents/domains`（含本 Plan）不在清单里，它的 dream 维护要再加一行 `cwd`。
- 清单里长期失败的目录只有日志可见，没有告警通道。
