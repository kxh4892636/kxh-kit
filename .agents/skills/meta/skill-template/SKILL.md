---
name: skill-template
description: 为新 skill 选择结构并生成可验证骨架。
argument-hint: "<skill 目标、目标目录与已有材料>"
disable-model-invocation: true
---

# Skill Template

把一个 skill 写成可预测的行为程序：调用边界清楚，信息按需要加载，步骤有完成标准，产物能够验证。创建或重构 skill 时完成下面的流程；具体正文只加载命中的模板分支。

## 流程

### 1. 对齐目标

从用户输入和目标仓库中确定：skill 要改变什么行为、目标目录、预期产物、不做什么，以及可以证明成功的证据。读取目标目录适用的 `AGENTS.md`、相邻 skills 和已有直接引用；可检索的事实由 Agent 自己查，只有会实质改变目标或调用方式的决策才交给用户。

**完成标准：** 已写下唯一的目标 skill 名、目标目录、行为目标、明确非目标和至少一种可执行验证；所有可由仓库证明的事实都有来源。

### 2. 选择调用方式

- **Model-invoked**：Agent 必须主动识别该行为，或其他 skill 必须调用它。省略 `disable-model-invocation`；description 以引导词和核心行为开头，每个真实分支保留一个触发条件。
- **User-invoked**：该行为应由用户有意识地启动。设置 `disable-model-invocation: true`；description 只保留面向用户的一行说明。需要输入提示时添加 `argument-hint`。
- **Router**：用户触发 skill 已多到需要导航时使用；router 本身必须是 user-invoked。

只使用当前运行环境和相邻 skills 已证明支持的 frontmatter 字段。

**完成标准：** 调用方式已唯一确定，并能说明它承担的是 context load 还是 cognitive load；description 不含重复触发条件。

### 3. 选择正文形状

选择最小的主形状；混合 skill 先用 branching 划分路径，再让每个分支采用自己的形状。

- **Workflow**：存在必须按顺序完成的动作。读取 [workflow.md](references/workflow.md)。
- **Orchestrator**：主要职责是编排已有 skills、工具或阶段。读取 [orchestrator.md](references/orchestrator.md)。
- **Branching**：不同可观察条件会产生不同过程或产物。读取 [branching.md](references/branching.md)。
- **Reference**：提供共享词汇、规则或审查维度，没有必要的执行顺序。读取 [reference.md](references/reference.md)。
- **Router**：帮助用户在多个 user-invoked skills 或 flows 中做选择。读取 [router.md](references/router.md)。

**完成标准：** 每段正文都能归入 steps、in-skill reference 或 disclosed reference；没有为同一行为并列两个主形状。

### 4. 生成 skill

创建 `<skill-name>/SKILL.md`，写入第 2 步确定的 frontmatter，再按命中的模板生成正文。使用一个已有强语义的引导词锚定行为。步骤放在主文件的最高信息层级；只有分支专属或体量明显影响主流程可读性的 reference 才外置，并用带触发条件的相对链接指向它。

每个步骤以可检查的完成标准结束；reference-only skill 用一个覆盖全部适用规则的 application criterion 约束 legwork。产物型 skill 明确位置、必需结构、验证和交接。

**完成标准：** 目标目录中的每个文件都有单一职责；主 `SKILL.md` 能独立完成路由；每个外部文件都由明确条件触发，且不存在同义重复的权威规则。

### 5. 审查并验证

使用 `/skill-check` 检查新 skill，然后修复所有已证明的问题。至少逐项验证：

- frontmatter 字段受当前环境支持，name 与目录名一致；
- model-invoked description 覆盖每个真实分支且没有同义触发，user-invoked description 保持一行；
- 每个步骤的完成标准可判定，必要时要求穷尽覆盖；
- 所有相对路径和 `/skill-name` 调用可以解析；
- 产物、验证、停止或交接条件明确；
- 每条规则都与行为相关、改变默认行为，并且只有一个权威位置；
- 正向行为是主要表述；硬护栏同时给出替代动作；
- 生成的目标 skill 没有未解析占位符；本 skill 自身的模板占位符统一用 `<...>` 明示；没有失效引用、编辑残留、sediment 或 sprawl。

**完成标准：** `/skill-check` 没有未处理的确定性问题；所有直接引用可解析；修改文件通过目标仓库的文本、格式和 diff 检查。

### 6. 交付

向用户报告创建或修改的文件、调用方式、采用的正文形状、验证证据和剩余风险。除非用户明确要求，不把模板示例、临时分析或草稿留在目标 skill 中。

**完成标准：** 用户可以从报告中定位产物、理解它何时触发，并复现验证结果。
