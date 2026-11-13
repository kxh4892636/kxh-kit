---
name: "008-dream输入扫描改为脚本"
description: "把 dream 的输入扫描与游标读写收进随包 dream-scan.mjs（按 Plan+会话记 seq 上界），提示词只负责跑脚本与提交后 --mark。"
status: completed
related_noted: ["003-校验脚本搬自动修复"]
next_step: "无；下次 dream 投递前重建宿主的 dream 任务以使用新提示词"
---

# 008-dream输入扫描改为脚本

## 目标

`dream.md` 的「输入」原来是三段散文：让模型自己扫 `log.jsonl`、自己比较 `seq > lastSeq`、自己在提交后改游标 JSON。seq 的口径（turn 的区间上界）和游标格式都靠模型理解，容易漏读或写错。

改成：输入扫描与游标读写全部在随包脚本 `scripts/dream-scan.mjs`，提示词只负责运行脚本、按清单处理、提交成功后 `--mark`。

## 交付

- 新增 [dream-scan.mjs](packages/dsh-toolkit/src/nano-flow/scripts/dream-scan.mjs)（随包分发的资产，与 check 脚本同目录）：
  - 默认扫描 `.agents/domains/*/plans/{active,reference,archived}/*/log.jsonl`，按域分组输出有新增的 Plan 与会话；`--json` 给机器读。
  - 游标 `$DSH_HOME/toolkit/nano-flow-dream.json`（v2）按「Plan + 会话」记录 `lastSeq`；`--mark "<planPath>#<sessionId>=<seq 上界>"` 只前进不后退。
  - CLI 守卫比较 realpath，避免经 profile 符号链接调用时静默无输出。
- `dream-scan.d.mts` 类型声明；`dream-scan.test.ts` 6 项单测。
- `prompts/dream.md`：输入段改成「跑脚本 + 读清单」；并行/门禁/写入边界改成「提交成功后 `--mark`」。用户手改的「知识归属 / 五个 pass」与去掉 `[nano-flow:dream]` 标记一并保留。

## 关键发现：seq 是「每会话」的

`log.jsonl` 里 turn 的 `seq` 来自宿主会话事件流，**换会话后从 4 重新开始**。实测 `dsh/plans/reference/2026-11-09-nano-flow优化迭代/log.jsonl` 有两个会话：`session-2f8b…`（19 turn，seq 4..3875）与 `session-3211…`（6 turn，seq 4..1669）。

所以旧设计「每个 Plan 一个 `lastSeq`」会把新会话的 turn 全部跳过。脚本改为**按 Plan + 会话**记游标；读到旧 v1 格式时视为空游标（全量重跑一次，dream 产物幂等）。

## 验收

- 单测 6 项：缺失游标全量、按会话过滤、v1 忽略、无新增归 idle、坏行跳过、mark 只前进且让下次扫描为空。全包 366 项通过。
- CLI 在真实工作区跑通：两个 Plan、两个会话分别列出；`--mark` 后对应会话不再出现在新增里。
- `vp check` 通过（110 文件）。
- 构建与安装：0.5.47 tgz 重装进 web profile。

## 影响

- 宿主已有的 dream 定时任务里存的是旧 `dream.md` 全文，需要重建任务才能用上新提示词；当前 `schedule_list` 为空，无需迁移。
- 旧 v1 游标会被忽略，第一次 dream 会重读全部已有轨迹。
