---
name: '013-dream手动维护命令'
description: '新增 /dream 手动命令：扫 .agents 下全部域、每域按目录名日期取最新 21 个 active/reference Plan，把 spec、notes_index 与 plan 轨迹路径交给模型跑五个 pass，自跑 check 并 commit；无 seq 游标、无定时。'
status: 'completed'
---

# dream 手动维护命令

## 目标

把 dsh 的 dream 记忆维护移植进 pi-toolkit，但去掉定时投递与 L0 落盘：暴露 `/dream` 命令，手动触发一次全量维护。

## 已确认的决策

用户 2026-11-09 逐项确认（问法见「拷问记录」）：

1. **范围**：扫当前 cwd 的 `.agents/domains/*`；每域在 `active` + `reference` 里按**目录名日期倒序**取最新 `dreamMaxPlansPerDomain`（默认 21）个 Plan；`archived` 不参与。
2. **会话**：Plan 轨迹（`<plan>/log.jsonl`）给路径，模型自己读并挑重点，代码侧不做 digest 压缩。
3. **多域**：单会话顺序处理（pi 无内置 subagent，不移植 `examples/extensions/subagent`）。
4. **收尾**：dream 自己跑 `nano_flow_check` 并 `git commit`（`docs(dream): …`）。
5. **GUIDE**：允许 dream 重写，需同步改 `prompts/system.md` 的写保护条款。
6. **执行位置**：`/dream` 在当前会话直接跑（`pi.sendUserMessage`）。
7. **增量**：无游标文件，每次全量。
8. **参数**：只支持无参数，永远扫 `.agents` 下全部域。

## 实现路径

### 1. 轨迹输入（已改为读 plan 轨迹）

- 直接读 `<plan>/log.jsonl`（ADR 005）：每个 run 一行，`entries` 是该 run 的 pi 会话条目原样副本。
- 没有 `log.jsonl` 的老 Plan（本功能上线前跑过的）退回读 `spec.md` 与 `notes_index.md`，不报错。
- **不再需要会话归属索引**：删掉原计划的 `dream/sessions.ts` 与「扫绑定找会话」一套逻辑，也消掉「跨 cwd 未归属」失败模式。
- 清单里仍给出 `spec.md` / `notes_index.md` / `log.jsonl` 三个路径与文件大小，便于模型估算该读多少。

### 2. 范围选择 `src/nano-flow/dream/scope.ts`

- 读 `<cwd>/.agents/domains/*/plans/{active,reference}/*`（只取目录），按目录名里的 `YYYY-MM-DD` 倒序，截前 `dreamMaxPlansPerDomain`。
- 输出 `域 → PlanRef[]`（Plan 内已有 `planRefOf`，复用）；域之间按域名字母序，保证顺序稳定可测。

### 3. 注入文本 `src/nano-flow/dream/prompt.ts`

拼 = `prompts/dream.md` 全文 + 本次运行清单：

```text
## 本次运行

- 工作区：<cwd>
- 域：<domain>（N 个 Plan）
  - <plan 目录名>｜spec.md ｜notes_index.md ｜log.jsonl（如有：大小与 run 条数）
- 无轨迹的 Plan：N 个（只读 spec 与 notes）
```

清单只给路径与时间，不给内容。

### 4. `prompts/dream.md`（从 dsh 版改写）

保留：五个 pass、知识归属表、写入边界、门禁、退出报告。
删除：游标与 `seq`、`log.jsonl` 扫描、Schedule 投递、subagent 并行、`$DSH_HOME`。
新增三条硬约束：

- **读会话的方式**：用 `bash` + `python3` / `grep -o` 抽取；`read` 工具 2000 行 / 50 KB 上限会截断单行（实测单行最长 405 KB），本机没有 `jq`。先读 `spec.md` 与 `notes_index.md`，再决定读哪些会话，不无脑全读。
- **工作区必须干净**：开跑前 `git status --porcelain` 非空则拒绝运行并报告，避免把用户未提交改动裹进 `docs(dream):` 提交。
- **顺序**：按域顺序，一个域跑完再下一个；`common` 最后。

### 5. 命令 `src/nano-flow/register.ts`

`pi.registerCommand("dream", { description, handler })`：

1. `tools.nanoFlow` 关 → 提示先去 `/toolkit` 打开，结束。
2. 当前会话不是 nano-flow 生效会话 → 提示 `/nano-flow` 开启（否则没有 `system.md` 与 `nano_flow_*` 工具）。
3. `.agents/domains` 不存在 → 提示先建域。
4. `!ctx.isIdle()` → 提示等当前轮结束。
5. `pi.appendEntry(DREAM_ENTRY, { at, domains, plans })` 记一次运行；`pi.sendUserMessage(拼接文本)` 触发本轮。

### 6. `prompts/system.md`

- 入口加第 5 条：收到 `[nano-flow:dream]` 开头 → 执行 dream，不进入恢复或拷问。
- 写保护改为：`GUIDE.md` 正文**只由 dream 维护**，日常循环与 `nano_flow_create` 都不得改；需要影响启动快照先写 note 或领域文档。
- 目录布局注释同步（`GUIDE.md # 会话启动快照（dream 维护）`）。

### 7. 配置

`config.ts` + `pi-toolkit.example.json` 增 `nanoFlow.dreamMaxPlansPerDomain`（默认 21），README 补一行。不做 `dreamMaxFiles/Bytes`（用户未要求，先不加）。

### 8. 领域文档

- `pi/CONTEXT.md` 增词条「dream」「dream 范围」。
- ADR `004-dream由dream命令手动触发.md`：手动命令 + 无 L0 落盘 + 无游标 + GUIDE 归 dream。

## 测试

- `sessions.test.ts`：fixture 会话 JSONL → Plan 映射；同文件多次绑定取最后一条；坏行跳过；未归属计数。
- `scope.test.ts`：目录名日期倒序、只含 active/reference、按 21 截断、域名排序稳定。
- `prompt.test.ts`：清单含域 / Plan / 会话路径与 modified；不含「游标」「log.jsonl」字样。
- `register.test.ts`：命令注册；开关关、非生效会话、目录缺失、非空闲四条拒绝路径；正常路径调 `sendUserMessage` 且写 `DREAM_ENTRY`。

## 风险

- **成本**：21 × 域数 个 Plan 的 `log.jsonl` 可能很大（条目原样复制、无截断），模型若不克制会读爆上下文；靠 dream.md 的「先 spec/notes 再挑轨迹」压。
- **老 Plan 无轨迹**：本功能上线前的 Plan 没有 `log.jsonl`，dream 只能读 spec 与 note；不补历史。
- **提交边界**：脏工作区直接拒绝是最简单的护栏，但用户可能想带着未提交改动跑 —— 拒绝并明确提示，让用户自己决定先提交还是先 stash。
- **GUIDE 写权限放开**后，GUIDE 质量取决于 dream 的晋升判断；单次运行后需人工扫一眼 diff。

## 验收

在 fullscreen pi 的 nano-flow 会话里 `/dream`：

1. 提示本轮进入 dream 维护，模型按域顺序读 spec/notes 与挑选会话；
2. 领域文档出现新增/修正的 question、ADR、workflow 或 `## 相关` 链路，改动都带出处；
3. `nano_flow_check` 通过，产生一次 `docs(dream):` 提交；
4. 再跑一次 `/dream`，在没有新结论时应报告「无改动」而不是重复造知识；
5. 脏工作区下 `/dream` 被拒绝并说明原因。

## 拷问记录

### 第 1 轮

#### Q1 — dream 每次处理什么范围

- 问题：当前绑定 Plan / git 变更集 / 扫全部会话当 L0。
- 推荐答案及理由：当前绑定 Plan + 其域 + `common`（范围确定、幂等、代码最简）。
- 修改意见：用户改为「`.agents` 下所有域；每域按时间顺序只取最新 21 个 active 与 reference Plan」。
- 处理结论：已确认，落到「范围」决策 1；21 成为配置项。

#### Q2 — GUIDE.md 写权限

- 问题：dream 可重写 / 仍只由用户写 / 只改指定段落。
- 推荐答案及理由：允许 dream 重写（晋升 pass 才有出口，手动触发可当场审 diff）。
- 修改意见：接受推荐。
- 处理结论：已确认，需改 `system.md` 写保护条款（决策 5）。

#### Q3 — `/dream` 在哪跑

- 问题：当前会话 / 新会话 / 两者都支持。
- 推荐答案及理由：当前会话直接跑。
- 修改意见：接受推荐。
- 处理结论：已确认（决策 6）。

### 第 2 轮

#### Q4 — 21 个 Plan 按什么排序、上限存哪

- 问题：目录名日期 / mtime / 不设上限。
- 推荐答案及理由：目录名日期倒序，上限写 `dreamMaxPlansPerDomain`。
- 修改意见：接受推荐。
- 处理结论：已确认（决策 1、实现路径 7）。

#### Q5 — 会话取到什么深度

- 问题：代码侧压 digest / 给路径让模型读 / 不用会话。
- 推荐答案及理由：代码侧压 digest。
- 修改意见：用户选「给路径让模型自己读」。
- 处理结论：已确认（决策 2）。代价是必须把「怎么读」写进 dream.md：`read` 会截断单行、本机无 `jq`。

#### Q6 — 多域怎么跑

- 问题：单会话顺序 / 移植 subagent 并行 / 只跑当前域。
- 推荐答案及理由：单会话顺序（pi 无内置 subagent）。
- 修改意见：接受推荐。
- 处理结论：已确认（决策 3）。

#### Q7 — check 与 commit 谁跑

- 问题：dream 自己 check + commit / 只改文件 / 提交前确认。
- 推荐答案及理由：dream 自己 check + commit（与 dsh 一致）。
- 修改意见：接受推荐。
- 处理结论：已确认（决策 4），并加「脏工作区拒绝运行」护栏。

### 第 3 轮

#### Q8 — 要不要游标 / 增量

- 问题：无游标全量 / 游标文件 / 用 git 当游标。
- 推荐答案及理由：无游标全量（手动触发频率低、代码最简）。
- 修改意见：接受推荐。
- 处理结论：已确认（决策 7）。

#### Q9 — `/dream` 参数形态

- 问题：无参数全量 + 可选域参数 / 只支持无参数 / 先弹域多选。
- 推荐答案及理由：无参数全量 + 可选域参数。
- 修改意见：用户选「只支持无参数」。
- 处理结论：已确认（决策 8）。

### 第 4 轮

#### Q10 — dream 的轨迹输入

- 问题：`<plan>/log.jsonl` 落盘后，dream 改读 plan 轨迹 / 优先 log 缺失回退会话 / 不改仍读会话文件。
- 前置：014（Plan 轨迹落盘）实现完成，plan 目录已有 run 级轨迹副本。
- 下游边界：决定是否需要 `dream/sessions.ts` 与会话归属索引。
- 推荐答案及理由：改读 `<plan>/log.jsonl`（去掉一个模块与一类失败模式）。
- 修改意见：用户接受推荐。
- 处理结论：已确认；原「会话归属索引」实现步骤作废，老 Plan 无轨迹时退回读 spec 与 note。

### 补充说明

- 取证结论（会话侧，已作废但仍存为背景）：会话目录里有真绑定 1 条、`custom/nano-flow-mode` 1 条、`custom_message/nano-flow/input` 6 条、正文噪音 100 条 —— 说明按子串找绑定会误命中，也是本轮改读 plan 轨迹的起因。
- `nano_flow_check` 已经具备 dream 门禁的两条硬约束（`## 相关` 链接与原因、`GUIDE.md` ≤ `guideMaxBytes`），无需新增校验。

## 实现结果（2026-11-09）

- `src/nano-flow/dream/scope.ts`：`selectDreamScope` 按域扫 `active` + `reference`，目录名日期倒序取 `dreamMaxPlansPerDomain`，附 `logBytes`。
- `src/nano-flow/dream/prompt.ts`：`DREAM_ENTRY`（`nano-flow-dream`）与 `buildDreamMessage`，把 `dream.md` 与 Plan 清单拼成一条 user 消息；清单只给路径与轨迹大小。
- `src/nano-flow/prompts/dream.md`：五 pass、知识归属、写入边界、门禁；新增「怎么读轨迹」（用 `bash` + `python3` 切片，禁止 `read`，本机无 `jq`）。
- `src/nano-flow/register.ts`：`/dream` 命令，四道门（开关 / 生效会话 / 空闲 / 工作区干净）+ 无 Plan 拒绝；通过后 `appendEntry(DREAM_ENTRY)` 再 `sendUserMessage`。
- `src/nano-flow/prompts/system.md`：入口第 2 条识别 `[nano-flow:dream]`；`GUIDE.md` 写保护改为「只由 dream 维护」，并注明等 `/dream` 晋升。
- 配置：`nanoFlow.dreamMaxPlansPerDomain`（默认 21）进 `config.ts` / `settings.ts` / `pi-toolkit.example.json` / README。
- 测试：`src/nano-flow/dream.test.ts`（范围排序/截断/域排序/轨迹大小/清单文本）+ `register.test.ts`（成功路径与四条拒绝路径）；`pnpm --filter @kxh4892636/pi-toolkit test` 240 项通过，`check` 无 lint / 类型问题。
- 未做：多域并行（pi 无内置 subagent）、游标、自动定时。

## 验收（2026-11-09，真机）

用户在真实 nano-flow 会话里跑通 `/dream`，产出提交 `b814d50 docs(dream): common/dsh/pi/music 领域文档维护`，11 个文件：

- **GUIDE 重写（晋升 pass）**：领域索引改为 pi / DSH / nano-flow / common / 产品域四段，约定段补上「一条 note = 一个交付单元」「每轮两次批量写」「绑定只由 `nano_flow_bind` 写」「GUIDE 正文只由 dream 重写」「上下文续接：DSH 轮转 / pi 清空」。
- **common**：新增 workflow `001-vite-plus大版本升级`。
- **dsh**：CONTEXT 补词条、新增 question `010-宿主悬浮提示的锚点与宽度`。
- **music**：新增 workflow `001-部署曲库与站点到服务器`。
- **pi**：新增 workflow `001-安装pi-toolkit并真机验收`、ADR 004 微调。
- 门禁按要求走通：`nano_flow_check` 通过后才提交，提交信息为 `docs(dream): …`。

用户同时确认：本 Plan 全部 note 完成后**继续留在 `active`**，不迁 `reference`。
