---
name: '014-Plan轨迹落盘'
description: '把每次 run 新增的 pi 会话条目原样复制到 `<plan>/log.jsonl` 一行，run 结束（agent_end）时写一次；文件仍在 .gitignore 内，不进版本库。'
status: 'completed'
related_noted: ['013-dream手动维护命令']
---

# Plan 轨迹落盘

## 目标

让每个 Plan 目录下有可离线阅读的轨迹文件 `<plan>/log.jsonl`。它不是 dsh 的 compact 摘要，而是 **pi 会话条目的原样副本**，按 run 聚合，每次 run 结束写一行。

## 已确认的决策

用户 2026-11-09 澄清（原话背景见「约束」）：

1. **不沿用 dsh 的 log.jsonl 形态**，内容全是 pi 的会话 JSONL 条目。
2. **复制会话条目到 Plan**：条目 `id` / `timestamp` / `message` 保持原样，便于与源会话对齐与按 `id` 去重。
3. **每次 run 写一次**：一次用户输入到代理停手为一条记录（含中间的多次工具调用），不做逐条实时写。
4. 文件仍在 `.gitignore` 的 `**/plans/**/log.jsonl` 之内，只留在本机。

## 实现

### `src/nano-flow/log.ts`

- `run` 记录形状：`{ type: "run", v: 1, sessionId, sessionFile, cwd, planPath, run, startedAt, endedAt, entries }`；`entries` 是本次 run 新增条目原样数组。
- `entriesSince(entries, mark)`：按 run 开始的叶子条目 id 切出新增部分；`mark` 缺失或不在分支上时返回空（宁可少记一条，也不重记历史）。
- `countRuns` / `runCountOf`：数已有 `type === "run"` 行给新记录编号，坏行跳过。
- `enqueueAppend(file, build)`：同一文件的追加串行化，避免两个 run 同时结束交错写；`build` 拿到 `run` 序号再构造记录。
- `appendRunRecord`：`mkdir -p` 后追加一行 JSON，不重写文件。

### `src/nano-flow/register.ts`

- `agent_start`：记 `runMark = ctx.sessionManager.getLeafId()` 与 `runStartedAt`。
- `agent_end`：nano-flow 生效 + 有绑定 + Plan 目录存在时，切出新增条目、按相对 `cwd` 的 `planPath` 调 `enqueueAppend`；失败只 `notify` 警告，不打断会话。
- 为什么在 `agent_start` 取 mark：用户消息在 `_prepareRun` 里才创建（`agent-session.js`），晚于 `before_agent_start` 与 `agent_start`，所以 mark 一定早于本轮第一条条目。

## 证据

- `src/nano-flow/log.test.ts`：mark 切片、记录形状、轮次计数含坏行、并发追加串行化、目录自动创建。
- `src/nano-flow/register.test.ts`：两轮 run 各写一条且序号递增、只含新增条目；开关关闭或未绑定时不产生文件。
- `pnpm --filter @kxh4892636/pi-toolkit test`：230 项通过；`check` 无 lint / 类型问题。
- **真机验证（2026-11-09，headless 续会话）**：造一个只含 header + `nano-flow-binding` 的会话文件（`/tmp/pi-logtest/session.jsonl`），跑两轮真机请求，`<plan>/log.jsonl` 出现两条记录：

```
行 1: run=1  entries=5   41,361 B   system 39,407 / user 229 / nano-flow/input 987 / session_info 137 / assistant 691
行 2: run=2  entries=6   16,439 B   system 13,193 / user 249 / nano-flow/input 987 / assistant 808 / toolResult 317 / assistant 731
```

  验证到：run 边界正确（run 2 只含本轪新增）、`toolResult` 在位、条目 `id` 与源会话一致、`planPath` / `sessionFile` / 时间戳正确。
- **增量边界确认**：本会话首个真实 run 记录是 `run 3`，覆盖 `11:23:41 → 11:24:59`，而代码最后一次修改是 `11:21:15Z`；更早的 9 个轮次都在旧代码下跑完，因此没有记录 —— 符合「只记增量」的设计，不是 bug。

## 已知取舍与实测体积

- **体积**：条目原样复制，单行实测 16–41 KB，其中 80–95% 是每轮重复的 `message/system` 提示词补丁。用户 2026-11-09 明确选择**全量保留**，不筛选 system 与 `nano-flow/input`，理由是轨迹要保真、提示词变更也是轨迹的一部分。
- **只在 run 末尾写**：run 中途崩溃或被强杀时，本次 run 不会落盘（源会话仍然完整）。
- 原录制里「不写 `log.jsonl`」的说法来自对用户表述的误读；当时用户说的是「每轮末尾同步一次」，不是「不要文件」。spec 的约束段已更正。

## 历史回填（一次性，2026-11-09）

功能上线前本会话已经跑了 9 个用户轮次，不会自动补记（`entriesSince` 只切本轮新增）。用户选择**一次性回填**，代码里不加回填逻辑。

- 边界：从首次 `nano-flow-binding` 条目（`2026-11-09T10:07:09.715Z`）到首个真实 run 记录之前；绑定前的对话不属于这个 Plan，不回填。
- 形式：按 user 消息切段，每段一条 `{ type: "backfill", v: 1, sessionId, sessionFile, cwd, planPath, segment, from, to, entries }`；与 `type: "run"` 分开编号，不混入真实 run 序号。
- 结果：10 段 / 395 条目 / 1.39 MB，与已有 run 记录无重复条目 `id`（按 `id` 去重校验，重复数 0）。
- 脚本：一次性脚本（`/tmp/pi-logtest/backfill.py`），不进仓库。
- 清理（2026-11-09，用户确认验收后）：删掉两条 `/tmp` headless 测试记录并把真实记录重编号为 `run: 1`；现文件为 11 行（`run 1` + `backfill segment 1-10`，约 1.6 MB），真实交互的后续 run 从 `run: 2` 继续。

## 验收

1. nano-flow 会话绑定某 Plan 后跑一轮问答（含至少一次工具调用）；
2. `<plan>/log.jsonl` 出现一条 `type: "run"` 记录，`run` 为 1，`entries` 覆盖本轮 user / assistant / toolResult 条目且 `id` 与源会话一致；
3. 再跑一轮，新增一行 `run: 2`，只含第二轮条目；
4. `/nano-flow` 关闭的会话跑一轮，不产生文件；
5. `git status` 不显示 `log.jsonl`（被 gitignore 排除）。