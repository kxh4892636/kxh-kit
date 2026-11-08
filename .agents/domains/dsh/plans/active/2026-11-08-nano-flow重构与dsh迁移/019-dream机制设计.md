---
name: "019-dream机制设计"
description: "dream 的最终设计：L0=compact log、L2=领域文档+「## 相关」互链（链+原因）、L3=guide（默认 13 KB，面板配置）、五 pass 与门禁。"
status: completed
related_noted:
  - '001-nano-flow重构'
  - '009-Plan轨迹日志'
  - '017-轮转后自动校验Plan并绑定看板'
  - '018-恢复Plan开头自动校验'
  - '020-迁移legacy领域文档'
---

# 019-dream机制设计

## 背景与已定决策

- 目标：按 Anthropic《The components of agent memory》（2026-11-06）的四层 + dreaming 闭环，把维护从手动 kaizen 升级为 dream 批处理。
- L0 = `log.jsonl`（compact 足够；轮转不删、只增量；不归档原文 transcript）。
- L1 = note 的「验证/结论」段（会话内写；dream 只读，不重写历史）。
- L2 = 领域文档（CONTEXT/questions/adr/workflows）+ `## 相关` 互链；生成物由 check 写。
- L3 = `guide.md`（dream 维护，默认 **13 KB**，上限进设置面板）+ `system.md`（用户维护）。
- 互链用 A 方案：页面正文的 `## 相关` 段，格式「链接 — 原因」。
- 触发用 **DSH 自动化任务**，默认每天 **08:00**；直接读写，不做人工 diff，每次运行后 git commit。
- 前置：先把 `.tmp/nano-flow-legacy` 的历史领域文档迁移进 `.agents`（020）。

## 层与维护者

| 层 | 存储 | 写者 | 读者 |
| --- | --- | --- | --- |
| L0 | `<plan>/log.jsonl`（compact；轮转不删） | 宿主（已有） | dream |
| L1 | note「验证/结论」段 | 模型（会话内） | dream |
| L2 | 领域文档 + `## 相关` 段（页面 + 互链） | dream（内容）、check（生成物） | 模型 / dream |
| L3 | `guide.md`（dream）、`system.md`（用户） | dream / 用户 | 每会话注入 |

生成物：`CONTEXT-MAP.md`、questions/adr/workflows 的 `index.md`、`notes_index.md`、spec `## 追踪 Note`——只由 check 写。

## 互链契约（A + 链 + 原因）

每个页面（question / ADR / workflow / CONTEXT 主体）文末固定段：

```md
## 相关
- [001-取消订单](../questions/001-取消订单.md) — 同一订单状态机，取消会触发超时关闭
- [002-订单超时关闭](./002-订单超时关闭.md) — 超时关闭是取消的兜底
```

- 每条 = 相对路径链接 + ` — ` + 一句原因；**原因必填**，写「为什么相关」。
- 只链接 `.md`；跨域用相对路径（如 `../../common/adr/001-….md`）。
- dream 负责新增、改原因、删除；目标被删时重指或删条目。
- check 校验：段内每条必须是可解析的相对链接、目标存在、原因非空；`## 相关` 之外不解析链接。
- 不在页面复制反向链接；v2 如需反查，由 check 生成域级 `links.md`（生成物）。

## dream 五 pass

1. **纠错**：读新增 log 段与相关 L2 页面；旧结论被后续证据推翻或环境变化时，就地修正 L2（questions/ADR/CONTEXT），在正文注明依据（note 名 + `sessionId/turn`）。note 是历史快照，不改写。
2. **提炼（L1→L2）**：按 kaizen 的「知识归属」上浮 note 的稳定结论：术语→CONTEXT、重复问题→questions、难逆决策→ADR、可复用活动→workflow；准入不满足不写，没有新结论就跳过。
3. **建链**：为新增或大改的页面补 `## 相关`（链 + 原因）；合并同因条目后再连。
4. **晋升（→L3）**：只挑「跨 Plan 反复用到且稳定」的极少条目进 `guide.md`，以索引/指针为主；按访问信号排序（`log.jsonl` 的 `tools[].args` 里读过的文件路径算热度/陈旧度）；超 13 KB 先下沉细节再写；整体重写 guide。
5. **剪枝/降级**：删过时/无访问/重复条目；页面合并后修正链接；CONTEXT 术语去重；workflow 覆盖同一活动时合并而非新增。

聚焦：只处理与当前 Plan 的 spec/domain 相关的域；跨域只读（用户确认后才写）。

## 触发 / 游标 / 幂等 / 并发

- 触发：**DSH 自动化任务**按日执行，默认每天 **08:00**；到期时以 dream 入口启动一次会话（可带 `plan`/`domain`）。手动 `/dream` 作为兜底。
- 调度归属：时间与开关在 DSH 自动化任务面板配置；插件只提供可被任务 prompt 触发的 dream 入口、游标与门禁。
- v2 可选：轮转后 / 空闲事件触发。
- 游标：`$DSH_HOME/toolkit/nano-flow-dream.json`，按 Plan 记录 `{ sessionId, turn, seq }`，只消费新增段。
- 幂等：同一 (sessionId, turn) 只处理一次；写入前校验文档内容 hash，冲突则跳过并报告。
- 并发：按 workspace 单写者锁；dream 运行期间不轮转。

## 门禁

- `nano_flow_check` 通过（新增：`## 相关` 链接/原因校验；GUIDE ≤ `guideMaxBytes`）。
- 每条新增/修正结论带出处（note 名或 `sessionId/turn`）。
- 生成物零改动：dream 只写页面正文与 `guide.md`，不改 spec/notes/索引。
- 单次运行预算（文件数/字节数）超限时停在该 pass 边界。
- 运行结束自动 `git commit`（消息 `docs(dream): …`）；失败不提交。

## 配置（nano-flow 面板）

- `guideMaxBytes` = **13 × 1024**（新增默认值）。
- `dreamEnabled`（bool，默认 false；自动化任务未启用时不跑）。
- `dreamMaxFiles` / `dreamMaxBytes`（单次预算，先给保守默认）。
- 自动化任务的触发时间（默认 08:00）在 DSH 自动化面板维护，不存进本插件的设置文件。
- 落点：`contract.ts` 的 `NanoFlowSettings`、`client/panel.ts:31-33` 的字段表、`$DSH_HOME/toolkit/nano-flow.json`、check 的 limits 入参。

## v1 / v2

- v1：互链契约 + check 校验 + guide 预算（面板）；dream 入口接 DSH 自动化任务（每日 08:00），跑通一个 Plan。
- v2：事件触发（轮转后/空闲）、反链视图、dream 自评（用后续 log 验证上次改动是否被采纳）。

## 实现拆分（待确认后开 note）

- 021：互链与 check（`## 相关` 解析/校验、死链报错；guide 预算读取配置；面板字段）。
- 022：dream 引擎（dream 入口、游标、五 pass、门禁、commit；接自动化任务）。
- 023：访问信号与晋升策略（log 读文件统计、guide 排序、剪枝规则）。

## 验收

- 单测：`## 相关` 合法/死链/缺原因；guide 超 13 KB 报错；游标只读新增段、重复运行幂等。
- live：对一个已完成 Plan 跑 `/dream`：至少上浮 1 条 question/ADR、补至少 1 条互链、guide 更新（或明确无晋升理由）；check 通过；无死链；git 有新 commit。
