---
name: "019-dream机制设计"
description: "dream 的完整设计：DSH 自动化任务每日 08:00 触发；L0=log.jsonl、L1=note 结论、L2=领域文档+「## 相关」互链、L3=guide（13 KB）；五 pass 与门禁。"
status: completed
related_noted:
  - '001-nano-flow重构'
  - '009-Plan轨迹日志'
  - '017-轮转后自动校验Plan并绑定看板'
  - '018-恢复Plan开头自动校验'
  - '020-迁移legacy领域文档'
  - '021-迁移legacy旧plans'
---

# 019-dream机制设计

## 1. 定位

dream 是**后台记忆维护引擎**：按 Anthropic《The components of agent memory》的四层 + dreaming 闭环，把记忆维护从手动复盘升级为定时批处理（原 kaizen skill 已删除，内容并入 dream）。它不新增第五层存储，只在现有文档上做纠错、提炼、建链、晋升、剪枝。

## 2. 分层与边界

| 层 | 存储 | 写者 | 读者 |
| --- | --- | --- | --- |
| L0 | `<plan>/log.jsonl`（compact；轮转不删，只增量） | 宿主插件 | dream |
| L1 | note 的「验证/结论」段（会话内写） | 模型 | dream（只读） |
| L2 | 领域文档（CONTEXT/questions/adr/workflows）+ `## 相关` 互链 | dream 写正文；check 写生成物 | 模型 / dream |
| L3 | `GUIDE.md`（dream，≤13 KB）；`system.md`（用户） | dream / 用户 | 每会话注入 |

生成物（`CONTEXT-MAP.md`、各 `index.md`、`notes_index.md`、spec `## 追踪 Note`）只由 check 写。

## 3. 运行形态：DSH 自动化任务

- 用宿主的 Schedule 服务（`@deepseek-ai/dsh-schedule`，任务页「自动化任务」）在**每天 08:00（Asia/Shanghai）** 创建/复用会话并投递 dream 指令。
- 投递目标用 **`new`**：每次运行新建会话。理由：`new_once` 复用同一会话，上下文逐日膨胀；而且该会话被轮转删除后，投递会被 Schedule 拒绝（目标已归档）。
- 新会话继承**创建任务时的 preset**，所以任务要在 **nano-flow 会话**里创建（或页面里选中该 preset），否则 dream 没有 nano-flow 提示词与工具。
- 手动兜底：任意 nano-flow 会话说「运行 dream」。
- 宿主必须运行；错过 08:00 只投递最近一次错过的发生点；投递「至少一次」，dream 必须幂等。

## 4. 任务契约（可复制）

- 标题：`nano-flow dream`
- 时间：`DTSTART;TZID=Asia/Shanghai:20261109T080000` + `RRULE:FREQ=DAILY`（页面也可用 cron `0 8 * * *`）
- 目标：`new`（新建会话，继承 nano-flow preset 与工作目录）
- 指令：`prompts/dream.md` 的全文（首行 `[nano-flow:dream]`），作为任务 prompt 原文投递；system.md 的入口第 5 条据此识别。
- 前提：nano-flow preset 已加 `@deepseek-ai/dsh-tool-schedule` 行（0.5.30），否则只有页面能建任务。

## 5. 输入与游标

- 游标文件：`$DSH_HOME/toolkit/nano-flow-dream.json`，形如 `{ "version": 1, "plans": { "<planPath>": { "lastSeq": 1234, "lastSessionId": "session-…", "lastTurn": 7, "ranAt": "ISO" } } }`。
- 扫描 `.agents/domains/*/plans/{active,reference,archived}/*/log.jsonl`；每个 Plan 只处理 `seq > lastSeq` 的 turn（log 的 turn 行带 `seq`）。
- 同时读：该 Plan 的 `spec.md`、note 结论（L1）、所属域文档（L2）、`GUIDE.md`（L3）。
- 游标只在 `git commit` 成功后推进；重复投递会重读同一段，结果幂等。

## 6. 五 pass

1. **纠错**：新增 log 与既有 L2 结论冲突时，就地修正（questions/ADR/CONTEXT），正文写依据 `> 纠正（日期，seq N）：…`。note 是历史快照，不改写。
2. **提炼（L1→L2）**：按「知识归属」（dream.md 内嵌）上浮 note 的稳定结论：术语→CONTEXT、重复问题→questions、难逆决策→ADR、可复用活动→workflow。准入 = 有证据 + 未来会再用 + 不与现有重复；不满足不写，没有新结论就跳过。
3. **建链**：为新增/大改页面补 `## 相关`（相对链接 + 一句原因）；目标被删时重指或删条目。
4. **晋升（→L3）**：只挑「跨 Plan 反复命中、稳定、与当前 goal 相关」的极少数条目进 guide，以索引/指针为主；按访问信号排序（log 的 `tools[].args` 里读过的文件路径 = 热度/陈旧度）；超 13 KB 先下沉细节再写；整体重写。
5. **剪枝/降级**：删同因重复、过时、无访问条目；workflow 同活动合并；CONTEXT 术语去重；从 guide 移除但保留在下层。

聚焦：只写当前 Plan 所属域 + `common`；其他域只读。

**并行（多业务域）**：域之间不跨域写，`common` 是唯一共享面。父会话按域分组，把每个域交给一个 subagent 并行处理（一次最多 4 个域）；子 agent 只写本域，不碰 `common`、`GUIDE.md`、游标、生成物、`spec.md` 与 note，不 commit、不跑 check；父会话汇总 `common` 候选、重写 guide、跑一次 check、一次 commit、再推进游标。

## 7. 写入边界

- 可写：`{domain}/CONTEXT.md`、`questions/NNN-*.md`、`adr/NNN-*.md`、`workflows/...`、`GUIDE.md`、游标。
- 只读：`spec.md`、note、全部生成物、`system.md`。
- 每条改动带出处（note 名或 `sessionId/turn`）；一次运行一次 `git commit`（`docs(dream): …`）。

## 8. 门禁

- `nano_flow_check` 通过（含新增：`## 相关` 链接/原因校验、GUIDE ≤ `guideMaxBytes`）；只由父会话执行。
- 链接可解析、原因非空；生成物零手改。
- 单次预算（文件数/字节数）超限时停在该 pass 边界并报告。
- check 失败不提交、不推进游标。

## 9. check 扩展

- 解析页面末的 `## 相关` 段：每条 `- [text](相对路径.md) — 原因`；目标必须存在、原因非空；段外链接不解析。
- `GUIDE.md` 大小 ≤ `guideMaxBytes`（来自设置）。
- v2：生成域级 `links.md` 反链视图（生成物）。

## 10. 配置

- `guideMaxBytes` = 13 × 1024（默认；落 `contract.ts`、`client/panel.ts` 字段表、`nano-flow.json`、check 的 limits）。
- `dreamEnabled`（默认 false；自动化任务未建时不跑）、`dreamMaxFiles`、`dreamMaxBytes`。
- 任务时间在 Schedule 页维护，不存插件设置。

## 11. 失败模式与幂等

- 宿主未运行：下次启动只投递最近一次；dream 按游标补处理，不丢不重。
- log 截断（args/result 4 KB、assistant 8 KB）：只做高置信修正，低置信跳过并记录。
- 并发（用户同时编辑）：写入前比对内容 hash，冲突则跳过该文件并报告。
- 写坏/校验失败：不提交，游标不前进，下轮重试。
- 回滚：每次 commit 即一个可回滚单元。

## 12. 测试与验收

- 单测：`## 相关` 合法/死链/缺原因/段后还有章节；GUIDE 超限报错；preset 含 `dsh-tool-schedule`；注入提示词含互链契约与 `[nano-flow:dream]` 入口；`prompts/dream.md` 随包复制。
- 集成：fixture 工作区 + 伪造 `log.jsonl` 跑 dream，断言新增 question/ADR、互链、guide 变化、游标前进、幂等重跑无 diff。
- live：建任务后 `run` 立即执行一次：dream 会话完成、check 通过、commit 出现、guide ≤13 KB、0 死链。

## 13. 实现拆分

- 022：互链契约 + check（`## 相关`、GUIDE 预算、面板字段）。
- 023：dream 指令（`prompts/dream.md`）+ 游标 + 自动化任务接入（preset 加 `tool-schedule`、入口规则）。
- 024：访问信号与晋升排序（规则写进 dream.md，随首次 dream 运行验收）。

## 14. 非目标

原文 transcript 归档、跨域写、改 note/spec、改生成物、反链视图（v2）、检索工具（v2）。
