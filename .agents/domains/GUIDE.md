# GUIDE

`kxh-kit` 的会话启动快照。这里只放索引与指针：结论在下列文档里，需要细节就点进去，不要在这里复述。

## 领域

- **pi**（`pi`）：当前主力扩展域，`@kxh4892636/pi-toolkit` 一个包五个开关（nestedSkills / sessionName / webTools / askQuestions / nanoFlow），Nano Flow 也在这里实现。词表见 [pi/CONTEXT.md](pi/CONTEXT.md)。
- **DSH**（`dsh`）：`@kxh4892636/dsh-toolkit` 工具集与 DSH 版 Agent 预设（宿主侧完整形态）。词表见 [dsh/CONTEXT.md](dsh/CONTEXT.md)。
- **nano-flow**：`nnf` CLI 只剩 `anki` / `self` / `fixture`；`workspace` 命令组与文档流程 skill 已于 2026-11-09 下线，流程改由 pi / dsh 的 nano-flow 实现提供。词表见 [nano-flow/CONTEXT.md](nano-flow/CONTEXT.md)。
- **common**：跨域共享约定（受管 skill、执行模态、发布包依赖、Vite+ 工具链）。词表见 [common/CONTEXT.md](common/CONTEXT.md)。
- etf / music / video 各自是产品域。全部入口见 [CONTEXT-MAP.md](CONTEXT-MAP.md)。

## 不可违反的约定

- 生成物只由 `nano_flow_check` 写：`CONTEXT-MAP.md`、各 `index.md`、`notes_index.md`、spec 的 `## 追踪 Note`。
- Plan 是唯一权威状态；note 四态 `pending / in_progress / blocked / completed`，`blocked` 必带 `reason` 写清在等什么（[006](dsh/adr/006-note阻塞态以reason表达.md)）。
- 一条 note = 一个可独立验收的交付单元，同单元返工并入、不新开（[010](dsh/adr/010-note按交付单元划分.md)）。
- 每轮最多两次批量写（轮首记方向、轮末补进度与证据），每批之后跑一次 `nano_flow_check`；面板与索引一轮之内允许滞后。
- 恢复已有 Plan 的那一轮只读：先 `nano_flow_bind`，再只报告，等用户第一条后续消息放行。
- Plan 绑定只由 `nano_flow_bind` 写（[009](dsh/adr/009-Plan绑定只经bind工具.md)）；`GUIDE.md` 正文只由 dream 重写。
- 上下文续接：DSH 是会话轮转（新会话 + seed，物理删除旧会话）；pi 是上下文清空（`nano-flow-reset` 过滤历史 + seed，不换会话）。两者 seed 都只带当前 Plan 与上一轮输出，所以**每轮结束前必须把检查点写回 spec 与 note**。
- `.agents/domains` 的文档格式以 [pi 的 check-domain.mjs](pi/plans/reference/2026-11-09-pi-toolkit插件/008-文档工具与校验.md) 为准（YAML 头 + 小写 `questions/` + 三位编号）。`packages/nano-flow` 里随包旧 skill 的布局（`story.md`、`QUESTIONS.md`、四位编号、story 模型）**不再适用**于本工作区的领域文档。

## 记忆维护

- 两种触发：DSH 由宿主每日 08:00 把 `dream.md` 投递到新会话，游标在 `$DSH_HOME/toolkit/nano-flow-dream.json`，只在 commit 成功后推进（[007](dsh/adr/007-dream由宿主定时任务投递新会话.md)）；pi 用 `/dream` 手动跑一次全量，每域取最新 21 个 `active` + `reference` Plan，无游标（[pi 004](pi/adr/004-dream由命令手动触发且不依赖seq游标.md)）。
- 五个 pass：纠错 → 提炼 → 建链 → 晋升 → 剪枝；只写当前 Plan 所属域与 `common`；收尾跑 `nano_flow_check` 并 `git commit`（`docs(dream): …`），工作区不干净就拒绝。
- 分层：L0 `<plan>/log.jsonl` 轨迹、L1 note、L2 领域文档 + `## 相关`、L3 本文件。pi 的轨迹是会话条目原样副本（每 run 一行，[pi 005](pi/adr/005-plan轨迹用会话条目副本按run落盘.md)），读它必须用 `bash` + `python3` 切片，`read` 会撞 50 KB 上限。
- 篇幅上限来自面板设置（每轮注入的「篇幅限制」块）；`GUIDE.md` 默认 13 KB。

## 热点入口

- 工作区暂无 active Plan；刚收口的是 music [2026-11-11-自动播放倒计时](music/plans/reference/2026-11-11-自动播放倒计时/spec.md)（6 条 note 全 completed、已上线）与 dsh [2026-11-13-dsh与pi对齐](dsh/plans/reference/2026-11-13-dsh与pi对齐/spec.md)（12 条全 completed、0.5.47 已发布并验收）；pi 侧最近收口的是 [2026-11-09-pi-toolkit插件](pi/plans/reference/2026-11-09-pi-toolkit插件/spec.md)（含 013 `/dream` 与 014 轨迹落盘）与 [2026-11-09-commandcode-provider接入](pi/plans/reference/2026-11-09-commandcode-provider接入/spec.md)。
- 更早的 dsh Plan：[2026-11-09-nano-flow优化迭代](dsh/plans/reference/2026-11-09-nano-flow优化迭代/spec.md)（绑定、面板提示、写入节奏、note 划分、代码治理 16 条全 completed）；轮转与 seed 设计在 [2026-11-08-nano-flow重构与dsh迁移](dsh/plans/archived/2026-11-08-nano-flow重构与dsh迁移/spec.md)。
- 源码：pi 侧 `packages/pi-toolkit/src/nano-flow/`（`prompts/system.md`、`prompts/dream.md`、`scripts/check-domain.mjs`、`skills/`），dsh 侧 `packages/dsh-toolkit/src/nano-flow/`。
- 交付工作流：[pi 001 安装并真机验收](pi/workflows/001-安装pi-toolkit并真机验收/001-安装pi-toolkit并真机验收.md)、[dsh 001 发布并真机验收](dsh/workflows/001-发布dsh-toolkit并真机验收/001-发布dsh-toolkit并真机验收.md)、[music 001 部署曲库与站点](music/workflows/001-部署曲库与站点到服务器/001-部署曲库与站点到服务器.md)、[common 001 Vite+ 大版本升级](common/workflows/001-vite-plus大版本升级/001-vite-plus大版本升级.md)。
- 常见坑：[dsh 问题索引](dsh/questions/index.md)——恢复只读、预设出现但工具缺失、历史加载失败、PATH 上的 dsh 装错 profile、宿主悬浮提示的锚点与宽度；[common 问题索引](common/questions/index.md)——发布包依赖、覆盖率门槛、提交时文件被改写；[pi 问题索引](pi/questions/index.md)——轨迹残留旧目录、overlay 格子底色、commandcode 403 套餐权限；[music 问题索引](music/questions/index.md)——音频 e2e 的墙钟与真浏览器、node 环境下 zustand 持久化断言；[nano-flow 问题索引](nano-flow/questions/index.md)——受管 skill 不更新、`nnf` 在 bash 里找不到。

## 用法

新会话先确认目标与所属域；目标或方案未定走 `/skill:ask`，定了走 `/skill:do`。过程结论写 note，稳定结论等 dream 上浮到领域文档，别在两处重复定义。
