---
name: "2026-11-13-dsh与pi对齐"
description: "把 pi-toolkit 在 2026-11-09 之后的迭代搬回 dsh-toolkit：提示词与模板、ask/do 删除、校验自动修复、learning 与 ponytail、Note 面板常驻、PTC 执行器，并发布 0.5.47 真机验收。"
status: "completed"
---

# dsh与pi对齐

pi-toolkit 与 dsh-toolkit 在 2026-11-09 分叉：dsh 最后一次源码提交在当天 16:27，pi 之后又迭代到 11-12（提示词/模板 12 次、校验自动修复、ponytail 注入、learning 6 轮、Note 侧栏常驻/折叠、/dream 与轨迹落盘）。本 Plan 把其中与宿主平台无关、可确定搬回的部分对齐到 dsh，并修掉 dsh 仍挂在已弃用 PTC 选型器上的问题。

## 调研结论（2026-11-13）

两包校验规则逐项比对**完全一致**（篇幅上限、`related_noted`、互链、blocked reason、spec 状态派生、追踪 Note）。真正的分叉是：

| 主题 | pi 侧迭代 | dsh 现状 | 本 Plan |
| --- | --- | --- | --- |
| 提示词/模板 | system.md 11.5 → 3.4 KB；user.md 三原则 + plain language + 批量写/建 note；adr/context/question 模板退化、note 去 reason | 旧版 11.5 KB、结构化模板 | [001](001-提示词与模板照搬pi.md) |
| ask/do skill | 1da5904 删除且无替代 | 仍保留，入口路由依赖 | [002](002-删除ask与do并清理引用.md) |
| 校验 | 5 类自动修复 + `fixed` 输出 + nameProblem 单点 + 原子写 | 只报错；name 规则复制两份 | [003](003-校验脚本搬自动修复.md) |
| 随包 skill | learning 6 轮迭代 + note-metrics.py；ponytail-audit/review | 旧 learning；无 ponytail | [004](004-学习skill与ponytail注入.md) |
| Note 面板 | 已绑定 Plan 时常驻、空列表显示「全部完成」 | 无未完成 note 就不渲染（pi 的 Plan 明确写了 dsh 保留旧行为） | [005](005-Note面板常驻与空态.md) |
| PTC 接线 | — | 预设挂已弃用的 `dsh-agent-tool-presentation` 选型器 | [006](006-预设改用ptc执行器.md) |
| 交付 | — | — | [007](007-发布0.5.47并真机验收.md) |

## 范围

- 规则层：`src/nano-flow/prompts`、`templates`、`scripts`、`skills`、`preset.ts`，以及受影响的测试与 README。
- Note dock 的常驻与空态（客户端）。
- 发布：按 0.5.47 打包、装进 web profile、重启宿主真机走查。

## 非范围

- 绑定存储、会话轮转与 seed、Plan 轨迹格式、dream 机制与游标、压缩取消：这些由宿主能力决定，不做「对齐」（pi 的过滤式清空在 dsh 无对应物）。
- pi 独有的工具面（Command Code provider、DeepSeek 网页工具、`ask_questions`、会话自动命名）与 dsh 独有的工具面（会话撤回、office 屏蔽、嵌套 skill 发现）：互为平台专有，不搬。
- `prompts/dream.md`：保留 dsh 版，pi 版依赖代码给出的 Plan 清单与无游标机制，与 dsh 的宿主投递 + 游标 + compact 轨迹 + 域并行耦合，不可移植。

## 决策记录

- 2026-11-13（用户）：对齐范围为「规则层 + Note 面板常驻」；提示词「完全照搬 pi」；ask/do「跟随 pi 删除」；校验自动修复「全部搬」；Plan 建在 dsh 域。
- 2026-11-13（用户）：dream.md 保留 dsh 版；交付含发布与真机验收；本次改动直接作为 0.5.47 发布（沿用工作区未提交的 bump）。
- 2026-11-13（用户）：nano-flow 预设不再挂已弃用的 `@deepseek-ai/dsh-agent-tool-presentation`，改用 `@deepseek-ai/dsh-tool-executor-ptc`。
- 依据：`@deepseek-ai/dsh-agent-tool-presentation@0.2.2-rc.2` README 首段 Deprecated，迁移说明为「replace this selector row with the corresponding executor row and remove `config.mode`; do not load both in the same scope」。

## 风险

- 删除 ask/do 后，本工作区后续会话不再有 `/ask`、`/do` skill；现有 Plan 里「按 /ask skill」的措辞会指向不存在的 skill，等 dream 晋升时统一。
- 照搬 pi 的 system.md 会删掉「恢复与轮转」「写入边界」，这两条行为改由工作区 `GUIDE.md` 与 dsh seed 承担；没有 GUIDE 的新工作区缺这两条规则。
- 模板退化改变新建 ADR/context/question 的形态（历史文档不改）。
- 直接挂 `dsh-tool-executor-ptc` 要求宿主已挂 `code-runtime`（`dsh-ptc-runtime-node`）；旧选型器在运行时缺失时会回退，直接挂执行器则会让预设激活失败。
- pi 的 system.md 目录注释 `Domain-Indexs + Domains-Relationships` 与实际生成的 `## Contexts` / `## Relationships` 不符，照搬时修正并在 001 记录。
- 安装并重启宿主会结束当前会话所在服务，走查前先提交。

## 进度

- 2026-11-13：调研完成（4 个并行子任务 + 逐文件 diff），Plan 与 7 条 note 建好。
- 2026-11-13：001-007 全部 completed。007 已把 0.5.47 装进 web profile，用户重启宿主后真机走查通过并回执。
- 2026-11-13：新增 008（dream 输入扫描改脚本），completed；游标改按「Plan + 会话」记，旧 v1 忽略。
- 2026-11-13：新增 009（dream 扫描改为 nano_flow_dream 工具），completed；Plan 因新工作迁回 active。
- 2026-11-13：新增 010（scan 提示跳过的记录），completed；非 dsh 记录改为提示、不报错。
- 2026-11-13：新增 011（dream 怎么读轨迹细节），completed；提示词补 bash+python3 切片片段。
- 2026-11-13：全部 note completed，用户确认迁 `reference`；本会话已重新绑定到新路径。
- 门禁证据：`vp check` / `vp test`（359 项）/ `test:coverage`（≥ 80）/ `build` / `nano_flow_check` 全绿；装包后的脚本实跑输出「已自动修复 2 项」。
- 代码提交：`git log` 里的 `feat(nano-flow): 对齐 pi …` 提交（含用户多次手改的提示词与 persona）；hash 随 amend 变化，文档不钉死。Plan 留在 active，等用户决定是否迁 reference。

## 恢复入口

先 `nano_flow_bind` 绑定本 Plan，再读 `notes_index.md`。唯一未完成项是 [007](007-发布0.5.47并真机验收.md)：代码、构建与安装已就绪，等用户重启宿主后按该 note 的清单走查；001-006 的返工并入各自 note。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
