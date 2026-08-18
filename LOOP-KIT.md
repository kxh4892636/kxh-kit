<!-- GENERAL RULES START -->

遵循原则：第一性原理；结构化思维；批判性思维；奥卡姆剃刀原理；对抗性审查；
推理原则：优先采用基于检索的推理，而不是基于预训练知识的推理。

<!-- GENERAL RULES END -->

<!-- LOOP KIT START -->

# Loop Kit

**流程**是一条贯穿多个 skill 的路径。多数路径沿主流程推进，由接入路径汇入。其余内容要么独立运行，要么作为底层词汇层存在。

## 主流程：想法 → 交付

大多数工作都沿这条路径推进：你有一个想法，并希望将它实现。

1. **`/grill-with-docs`**——通过访谈打磨想法。**已有工作区**时从这里开始：它是有状态的，会将访谈中确认的内容保留在对应业务域的 `CONTEXT.md` 和 ADR 中。（没有工作区？使用 `/grilling`——参见“独立工具”。`grill-with-docs` 会留下文档记录。）固定明确 `/verifying` 使用哪些验收门禁。
2. **`/implement`**——在同一个上下文窗口中完成构建，默认使用 **`/tdd`** 编写测试。测试有证据后，它先运行 **`/verifying`** 执行适用的交付门禁，再运行 **`/code-review`** 完成 **Standards + Spec** 双轴审查，然后提交。需要具体的测试先行行为时单独使用 **`/tdd`**，需要交付证据时单独使用 **`/verifying`**，需要审查分支或 PR 时单独使用 **`/code-review`**。

## 接入路径

从特定起点生成工作，再汇入主流程。

- **一个模糊的想法——还不确定为谁做、做什么、为什么** → **`/to-story`**。它由 **`/grilling`** 驱动，把打磨过程当作一张**迷雾中的行动地图**推进（与用户讨论、后台调研，互不依赖的路径并行）。用户故事清晰后进入 **`/to-issues`**；
- **一项庞大而模糊的工作——greenfield project 或超大型功能开发，大到单次会话上下文无法完成** → **`/to-issues`**。它由 **`/grill-with-docs`** 驱动，将访谈中澄清的内容动态维护为业务域 plans 目录下的一份 **spec** 和可独立实现、独立验证的 **tracer-bullet issue**。就绪的 issue 直接进入 **`/implement`**，仍需澄清的经 **`/grill-with-docs`** 汇入主流程。

## 底层词汇

供模型调用的参考资料运行在其他 skill _之下_——每一个都是相应术语的 **single source of truth**。当问题出在**术语**而非流程时，直接调用它们；也可以让上层 skill 按需引入它们。

- **`/domain-modeling`**——打磨项目的 **domain language**：质疑模糊术语，消解 **overloaded term**（例如用“account”承担三种含义），将难以逆转的决策记录为 ADR。它是 `/grill-with-docs` 主动采用的方法，用于保持每个业务域的 `CONTEXT.md` 都是一份干净的术语表。
- **`/codebase-design`**——用于设计模块 **shape** 的 **deep-module vocabulary**：module、interface、depth、seam、adapter、leverage、locality，即在清晰的 seam 后通过小型 interface 承载大量行为。`/tdd` 使用这套语言。
- **`/code-spec`**——代码规范，编写, 修改或审查代码时使用.

## 独立工具

完全独立于主流程。

- **`/grilling`**——与 `/grill-with-docs` 相同的持续追问式访谈，但它是**无状态**的：不会在本地保存任何内容，也不会创建领域文档。当工作**不依附于工作目录**时使用它——无论是打磨计划、设计、文章，还是任何不依附于代码仓库的内容。如果位于工作目录中，则使用 `/grill-with-docs`：它执行相同的访谈并留下文档记录，因此严格来说是更优选择。
- **`/wait-what`**——用于纠正没有传达清楚的信息。在对话过程中或任何其他 skill 内使用它，agent 会补充你缺失的上下文，用通俗语言和相关业务域 `CONTEXT.md` 中的词汇重新表达刚才的内容。它是事后补救；`/grill-with-docs` 是事前预防，因为尽早确认共同语言，才能避免术语突然出现。
- **`/writing-for-agents`**——编写供 agent 使用的文档时所参考的资料：skill、AGENTS.md 以及 **context pointer** 指向的文档。
- **`/to-workflow`**——发现当前工作中的重复模式，并将其固化为 **`/workflow-x`** 业务域目录中的 Workflow。
- **`/e2e`**——验收：维护 Markdown 验收资产（Gherkin 场景），或执行 agent 驱动的验收走查，以证据链（验收主张 → 真实路径 → 外部观察 → 结论）证明消费者可感知的结果。
- **`/codin-d2c-cli`**——调用 `codin-d2c` 完成 Figma Design-to-Code；D2C 静态资源使用 SVG 格式。

<!-- LOOP KIT END -->

<!-- PROJECT RULES START -->

# 领域文档

在探索 workspace（工作区）时，应如何使用本工作区的领域文档。

## 规则

- 所有文件都创建在工作区根目录，而不是子仓库中；
- `docs/` 下的 ADR 和 Plan 文件名及所有文档正文使用中文；约定名 `CONTEXT.md`、`spec.md`、`story.md` 与 `domain-name` 除外；
- 每个 `docs/{domain-name}/CONTEXT.md` 行数 <= 610；每个领域的 `adr/*.md` 文件数 <= 89，行数 <= 144；
- 如果超出任一限制，合并、拆分或删除超出的内容。

## 探索前先定位领域

1. 阅读工作区根目录下的 **`CONTEXT-MAP.md`**，确定即将处理的业务域及其关系。
2. 阅读对应业务域的 **`docs/{domain-name}/CONTEXT.md`**。
3. 阅读该业务域中与即将处理区域相关的 **`adr/`**。

跨业务域工作需要读取所有相关业务域的领域文档及 `CONTEXT-MAP.md` 中的关系。

如果其中任何文件不存在，**静默继续**。不要报告文件缺失，也不要建议预先创建。只有在术语或决策真正得到确认时，`/domain-modeling` skill（由 `/grill-with-docs` 进入）才会按需创建它们。

## 布局

工作区默认采用 multi-context（多上下文）布局：

- 根目录 `CONTEXT-MAP.md` 只索引业务域及其关系。
- 每个业务域封装在 `docs/{domain-name}/` 中。
- `docs/common` 包含多个业务域共享的领域术语和 ADR;
- `docs/{domain-name}/CONTEXT.md` 包含该业务域的 domain glossary（领域术语表）。
- `docs/{domain-name}/adr/` 包含该业务域的 ADR（Architecture Decision Record，架构决策记录）。
- `docs/{domain-name}/plans/` 包含该业务域的工作计划（Plan）：每个子目录是一项工作的 spec 及其 tracer-bullet issue 拆分（由 `/to-issues` 或 `/to-story` 维护），按生命周期分类，约束见「Plan 生命周期」。

```text
/
├── CONTEXT-MAP.md
├── docs/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   ├── adr/
│   │   │   └── 0001-采用事件溯源订单.md
│   │   └── plans/
│   │       └── active/
│   │           └── 0001-支持订单取消/
│   │               ├── spec.md
│   │               └── 01-取消接口.md
│   └── billing/
│       ├── CONTEXT.md
│       ├── adr/
│       └── plans/
└── src/
```

`domain-name` 使用稳定、简短的 kebab-case 名称。新增业务域时同时把它加入 `CONTEXT-MAP.md`；跨业务域关系也只在 map 中定义一次。

## Plan 生命周期

`docs/{domain-name}/plans/` 按生命周期分为三类目录：

- `active/`——进行中：当前正在推进的 plan；
- `reference/`——可参考：已完成且仍有参考价值的 plan；
- `archived/`——已归档：已废弃、已过时、不再有用的 plan。内容冻结，不再更新，也不再是权威来源。

plan 生命周期与 plan 内 spec/issue 的状态协议相互独立：目录位置承载活性与价值分类，frontmatter `status:` 承载执行进度，两者不互相推导；

## 使用术语表中的词汇

当输出需要命名领域概念时（例如 Issue 标题、重构提案、假设或测试名称），使用对应业务域 `CONTEXT.md` 中定义的术语。不要改用术语表明确排除的同义词。

如果所需概念尚未收录在术语表中，这是一个信号：要么你正在创造项目并未使用的语言（重新考虑），要么确实存在缺口（记录下来，交给 `/domain-modeling` 处理）。

## 明示 ADR 冲突

如果输出与现有 ADR 冲突，应显式指出，而不是静默覆盖：

> _与 ADR-0007（event-sourced orders）冲突——但值得重新讨论，因为……_

<!-- PROJECT RULES END -->
