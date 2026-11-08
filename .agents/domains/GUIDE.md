# GUIDE

`kxh-kit` 的会话启动快照。这里只放索引与指针：结论在下列文档里，需要细节就点进去，不要在这里复述。

## 领域

- **DSH**（`dsh`）：本工作区自研的 `@kxh4892636/dsh-toolkit` 插件与 Nano Flow 预设。词表见 [dsh/CONTEXT.md](dsh/CONTEXT.md)。
- **nano-flow**：`nnf` CLI 与受管 skill；**common** 承载跨域共享约定；etf / music / video 各自是产品域。全部入口见 [CONTEXT-MAP.md](CONTEXT-MAP.md)。

## 不可违反的约定

- 生成物只由 `nano_flow_check` 写：`CONTEXT-MAP.md`、各 `index.md`、`notes_index.md`、spec 的 `## 追踪 Note`。
- Plan 是唯一权威状态；note 四态 `pending / in_progress / blocked / completed`，`blocked` 必带 `reason` 写清在等什么（[006](dsh/adr/006-note阻塞态以reason表达.md)）。
- 恢复已有 Plan 的那一轮只读：只报告，等用户第一条后续消息放行。
- 会话轮转不挂压缩插件：达到 `rotateAt × contextWindow` 就换新会话并物理删除旧会话；每轮结束前把检查点写回 spec 与 note。
- 篇幅上限来自面板设置（每轮注入的「篇幅限制」块）；`GUIDE.md` 默认 13 KB。

## 记忆维护

- dream 每天 08:00 由宿主自动化任务把 `prompts/dream.md` 投递到新建的 nano-flow 会话；游标在 `$DSH_HOME/toolkit/nano-flow-dream.json`，只在 commit 成功后推进（[007](dsh/adr/007-dream由宿主定时任务投递新会话.md)）。
- 五个 pass：纠错 → 提炼 → 建链 → 晋升 → 剪枝；只写当前 Plan 所属域与 `common`；多域时按域并行，父会话收口 check、commit 与游标。
- 分层：L0 `log.jsonl`（本地、不入 git）、L1 note、L2 领域文档 + `## 相关`、L3 本文件。

## 热点入口

- 最近归档的 Plan（dsh 暂无活跃 Plan）：[2026-11-08-nano-flow重构与dsh迁移](dsh/plans/archived/2026-11-08-nano-flow重构与dsh迁移/spec.md)——0.5.37 已完成真机验收；追溯轮转与 seed 设计从 note 031/032 及其 `log.jsonl` 入手。
- 插件源码 `packages/dsh-toolkit/src/`：固定提示词 `src/nano-flow/prompts/system.md`，dream 指令 `src/nano-flow/prompts/dream.md`，校验脚本 `src/nano-flow/scripts/check-domain.mjs`。
- 发布与真机验收：[001-发布dsh-toolkit并真机验收](dsh/workflows/001-发布dsh-toolkit并真机验收/001-发布dsh-toolkit并真机验收.md)。
- 常见坑：[dsh 问题索引](dsh/questions/index.md)——恢复只读、预设出现但工具缺失、历史加载失败、PATH 上的 dsh 装错 profile。

## 用法

新会话先确认目标与所属域；目标或方案未定走 `/ask`，定了走 `/do`。过程结论写 note，稳定结论等 dream 上浮到领域文档，别在两处重复定义。
