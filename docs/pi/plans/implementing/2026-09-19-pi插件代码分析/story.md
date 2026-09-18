# pi 插件代码分析

## 原始想法

「对 packages 中的 pi 插件进行代码分析」

## 角色

- **kxh4892636（维护者）**：在本工作区维护两个 pi 扩展包 `@kxh4892636/pi-deepseek-web`、`@kxh4892636/pi-nested-skill`，希望先拿到可信的质量体检，再在不改变对外行为的前提下清理已知问题。

## 故事

### US-001 一次可复核的插件质量体检

作为维护者，我希望对 `packages` 下两个 pi 插件跑一遍静态分析与代码审查，并拿到有证据、按优先级排序的结论，以便决定后续是清理、重构还是保持现状。

- [x] 给出两包的门禁实测结果：`vp check`、vitest（含覆盖率）、fallow `dead-code` / `health` / `dupes` / `security` / `coverage-gaps`。
- [x] 逐条列出死代码项，标明 `文件:行`、可自动修复性、建议动作。
- [x] 列出复杂度、重复、测试缺口及其他风险，并区分「已验证事实」与「未验证推断」。
- [x] 结论落到 Plan 文档，新上下文仅凭文档即可恢复并直接执行清理。

### US-002 按分析结论清理插件代码

作为维护者，我希望执行分析给出的清理项（去掉无消费者导出、拆分超阈值函数、补齐缺失用例），以便在不改变对外行为的前提下降低维护成本。

- [x] 9 个无消费者导出的 `export` 收窄，`fallow dead-code` 不再报告导出项
- [x] `mapAnthropicResponse` 拆分后不再超复杂度阈值，行为由测试锁定
- [x] 新增用例覆盖已知 skill 目录分支、不可读 skill 文件分支与多 `text` block 拼接
- [x] 两包 `vp check` 与 `vp test --run --coverage` 全绿，覆盖率不低于仓库阈值
- [x] spec 与规范两位独立审查者结论均闭环
- [x] 改动已 commit

## 约束与澄清

- 2026-09-19 用户原始表述仅一句话，未指定工具与深度；本次采用工作区既有工具链（vite-plus `vp`、vitest、fallow 3.26.0）。
- 2026-09-19 用户选择 (a)：执行清理（去 `export` + 拆 `mapAnthropicResponse` + 补用例）。`messageOf` 提取、`truncated` 死面处置、`web_fetch` SSRF 防护不在本次范围。
- US-001 为只读分析，不改动 `packages/pi-*` 源码；US-002 只做行为等价的清理重构（收窄导出面、拆分函数、补用例），且两轮都不修订上游实现 spec（`2026-09-18-*` 两个 Plan）。
- 基线：工作区 `main` @ `b65c2fe3`，`git status` 干净。
- 两个 pi 插件是 `packages` 下唯一带 `pi-package` 关键字与 `pi.extensions` 清单的包；`dsh-*` 属 DSH 域，仅作为对照参考。

## 迷雾

- **`web_fetch` 是否需要 SSRF 防护**：当前实现允许模型抓取任意 http(s) URL 并跟随重定向，未拒绝私网/回环地址；spec 与 ADR-0002 均未表态。属产品取舍，未验证是否有真实风险场景。

## 上下文

- [spec](spec.md)、[note 01：静态分析与代码审查](01-静态分析与代码审查.md)、[note 02：清理交付](02-清理交付.md)
- [CONTEXT](../../../CONTEXT.md)、[ADR-0002 搜索密钥落用户配置与直连抓取](../../../adr/0002-搜索密钥落用户配置与直连抓取.md)
- 被分析基线：`packages/pi-deepseek-web`、`packages/pi-nested-skill` @ `b65c2fe3`
- 上游实现文档：[pi-deepseek-web spec](../../reference/2026-09-18-pi-deepseek-web插件/spec.md)、[pi-nested-skill spec](../../reference/2026-09-18-pi-nested-skill插件/spec.md)
