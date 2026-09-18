---
status: completed
---

# pi 插件代码分析

## 问题

`packages` 下两个 pi 扩展包（`@kxh4892636/pi-deepseek-web`、`@kxh4892636/pi-nested-skill`）已交付并完成真机验证，但没有一次系统的质量体检：不清楚死代码、复杂度热点、测试缺口与风险优先级，也就无法判断该清理、重构还是保持现状（US-001）。

## 方案

以工作区既有工具链对两包做只读分析，结论落文档：

- 门禁层：`vp check`（格式/lint/类型）、`vp test --run --coverage`（含 `vite.config.ts` 设定的 80% 阈值）。
- 静态层：fallow 3.26.0 的 `dead-code`（含 `--unused-deps`、`--coverage-gaps`）、`health`（含 `--complexity-breakdown`）、`dupes`、`security`，全部 `--format json --quiet` 解读。
- 人工层：通读两包 `src/**`，与宿主 `@earendil-works/pi-coding-agent` 0.85.1 的类型定义和实现交叉核对，识别工具看不见的问题（重复小函数、不可达分支、SSRF 面）。

产物分两阶段：阶段一 [note 01](01-静态分析与代码审查.md) 的分级清单（不产出代码改动）；阶段二在用户确认 (a) 后按清单第 2、3、8 节执行清理，见 [note 02](02-清理交付.md)。

## 已排除的备选

- **直接清理死代码**：用户只要求「代码分析」，且 8 个未使用导出可能是有意的模块契约；未经确认不动源码。
- **仓库级 fallow 扫描替代包内扫描**：`fallow health` 在仓库作用域会把 `apps/*`、其他 `packages/*` 混入指标（首次运行 `files_analyzed=366`），无法反映单包质量；改为包目录内运行。
- **`fallow audit --base` 作为主证据**：基线 `b0cc1409` 时两包已被删除，`--workspace 'packages/pi-*'` 匹配不到，且其余 994 个变更文件会淹没结论；仅用其 `introduced` 标记交叉验证死代码与复杂度条目。
- **把结论直接改进上游实现 spec**：上游 Plan（`2026-09-18-*`）已完成并处于 `reference`，本次是独立工作；仅在「上下文」引用，不改写它们。

## 实施决策

- **分析作用域**：`packages/pi-deepseek-web`、`packages/pi-nested-skill`；`dsh-*` 仅作对照（同为嵌套 skill 扫描，宿主不同）。
- **fallow 作用域**：默认在包目录内运行以获得单包指标；需要 `introduced` 归因时在仓库根运行 `fallow audit --base b0cc1409` 并按路径过滤。
- **误报判定口径**：工具报告与源码事实冲突时，以「是否存在消费者」为准，并记录误报理由（本次为 `@typescript/native`，由 `vp check` 的 `typeCheck` 经 `tsc` 二进制消费）。
- **结论分级**：分为「已验证事实」「误报保留」「待决取舍」；待决项（SSRF、去 `export` 与否）只记录证据与影响，不替用户决定。
- **文档落点**：新建 `docs/pi/plans/planning/2026-09-19-pi插件代码分析/`，随附 story、spec 与本 note；迁入 `reference` 需用户确认。

## 工作环境

- 工作区：kxh-kit pnpm workspace（`packages/*`），Node 24.21.0，pnpm 11.22.0。
- 工具：`vp`（vite-plus 0.2.6）、vitest 4.1.10、fallow 3.26.0（`fallow` 已在 PATH）。
- 宿主源码可读：`node_modules/.pnpm/@earendil-works+pi-coding-a_*/node_modules/@earendil-works/pi-coding-agent/dist/**`（0.85.1）。
- 无凭据需求：本次不调用 DeepSeek API，也不做真机 e2e。

## 范围

- 两包源码、测试、README、`package.json` 的静态分析与人工审查。
- 门禁命令实测与结果解读。
- 与宿主 pi 0.85.1 的 API 一致性核对。
- 确认后执行清理交付：收窄 9 处无消费者导出、拆分 `mapAnthropicResponse`、补 4 条用例（[note 02](02-清理交付.md)）。

## 非范围

- 修改上游实现 spec、测试或（除上述清理外的）源码行为。
- `messageOf` 提取、`truncated` 死面处置、`web_fetch` SSRF 防护（均属「待定」，需另行确认）。
- 真机 e2e、真实 API 调用、npm 发布验证。
- `dsh-*`、apps 及其他 `packages/*` 的质量分析。
- 建立 CI 门禁、配置 fallow baseline。

## 执行约束

- 只读：不得改动 `packages/pi-*`；允许在 `docs/pi` 新建本 Plan。
- 每条结论必须可追溯到命令输出或 `文件:行`，不写无证据的推断。
- 工具不可用的结论要如实标注（例如 `audit` 的 `--workspace` 不可用）。
- 完成标准：验收项全部勾选；`node .agents/skills/nano-flow/scripts/check-domain.mjs .` 不因本次新增文档报错。

## 待定

- **`web_fetch` 是否加 SSRF 防护**：拒绝私网/回环与云元数据地址，或记 ADR 接受风险。恢复条件：用户对「模型可抓任意内网 URL」表态。
- **`truncated` 死面处置**：接上截断信号（如 `maxUses` 耗尽仍无结果块时置位）或删除字段与分支。恢复条件：确认是否存在真实截断场景。
- **`messageOf` 三份拷贝**（`config.ts` / `fetch.ts` / `search.ts`）：是否提取共享模块。属重复代码（低于 fallow 判重阈值），提取会新增一个模块边界；恢复条件：确认是否有其他复用者或再进行同类改动。
- **外部 JSON 结果条目的防御**（`search.ts` 的 `collectSources`/`toSource` 直接读 `item.url.length`）：网关返回缺 `url` 的条目会抛裸 `TypeError`，与 code-spec「外部数据默认不可信」及错误文案目标不符；修复会改变行为（跳过畸形条目），需先确认。来源：规范审查 P2（既有代码，非本次引入）。
- **`citationSnippets` 导出面**：生产侧仅被 `mapAnthropicResponse` 消费，其余消费者是其自身测试；与本次「无消费者导出」同类，但不在 note 01 清单内，未处理。恢复条件：再次统一导出面时一并评估。
- **`@typescript/native` 误报登记**：两包各剩 1 条 `unused_dev_dependency`，实际由 `vp check` 的 `typeCheck` 经 `tsc` 二进制消费（无 import 边）。可接到仓库 `.fallowrc.jsonc` 的 `ignoreDependencies`，符合其已写明口径「只登记静态分析无法看见、但确有运行时/人工入口的事实」；属仓库级配置改动，未纳入本次。
- **`discover.ts` 的 `walk`/`walkChildren` 风格**：仍为 `function` 声明，与同文件其余私有 helper 及 code-spec「使用箭头函数」不一致。恢复条件：下次改到该文件的这两个函数时顺带归一。

## 上下文

- [note 01 静态分析与代码审查](01-静态分析与代码审查.md)（全部分级清单与证据）
- [CONTEXT](../../../CONTEXT.md)、[ADR-0002](../../../adr/0002-搜索密钥落用户配置与直连抓取.md)、[ADR-0001](../../../adr/0001-嵌套skill以扩展接缝交付.md)
- 上游实现 Plan：[pi-deepseek-web](../../reference/2026-09-18-pi-deepseek-web插件/spec.md)、[pi-nested-skill](../../reference/2026-09-18-pi-nested-skill插件/spec.md)
- 基线：`main` @ `b65c2fe3`（分析时工作区干净）

## 当前进度

- 截至 2026-09-19：全部完成。
  - [note 01](01-静态分析与代码审查.md)：静态分析与代码审查（门禁与 fallow 实测、两包源码通读、宿主 API 交叉核对）。
  - [note 02](02-清理交付.md)：清理交付完成——9 处导出收窄、`mapAnthropicResponse` 拆分、3 条用例 + 1 条断言、审查闭环，代码提交 `a2851a29`；最终门禁：两包 `vp check` pass、43/30 tests passed、`fallow dead-code` 各剩 1 条误报。
- 审查结论：spec 审查「有条件通过」、规范审查「OK with notes」，均无阻断项；放行条件与两条既有 P2 已处理或登记到「待定」。
- 未验证项：SSRF 真实可达性、真机 e2e（均非本次范围）。
- 上游实现文档未改动，`docs/pi` 其余历史缺项（如 `QUESTIONS.md` 缺失、既有 Plan 缺 story.md）按规则原样保留。

## 恢复入口

- 阅读顺序：[story](story.md) → 本 spec → [note 01](01-静态分析与代码审查.md) → [note 02](02-清理交付.md)。
- 先核对的现场事实：`git log --oneline -3` 应含 `refactor(pi): 收窄无消费者导出并拆分搜索响应映射`；`git status` 应干净（本 Plan 已随 `docs(pi)` 提交）。
- 下一项行动：用户确认后把本 Plan 从 `implementing/` 迁入 `reference/`（`git mv` 后按需修正相对链接；本 Plan 内链接均为同目录相对引用，不受生命周期目录变更影响）。
- 停止条件：要动「待定」中任一项（尤其 SSRF、`truncated`、外部 JSON 防御）时，先澄清产品取舍，另开交付 note，不在本 Plan 内直接改行为。

## Notes

| #   | Notes                                          | 状态      | 阻塞于 | 下一步                         |
| --- | ---------------------------------------------- | --------- | ------ | ------------------------------ |
| 01  | [静态分析与代码审查](01-静态分析与代码审查.md) | completed | —      | 已消费其清理清单               |
| 02  | [清理交付](02-清理交付.md)                     | completed | —      | 待用户确认后整体迁入 reference |
