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
- **`/to-workflow`**——发现当前工作中的重复模式，并将其固化为 `docs/{domain-name}/workflows/*.md` 中的 Workflow。
- **`/e2e`**——验收：维护 Markdown 验收资产（Gherkin 场景），或执行 agent 驱动的验收走查，以证据链（验收主张 → 真实路径 → 外部观察 → 结论）证明消费者可感知的结果。
- **`/codin-d2c-cli`**——调用 `codin-d2c` 完成 Figma Design-to-Code；D2C 静态资源使用 SVG 格式。

## 领域文档

- 工作区默认采用 **multi-context** 领域文档布局：根目录使用 `CONTEXT-MAP.md`，每个业务域封装在 `docs/{domain-name}/`。参见 `DOMAIN.md`。

<!-- LOOP KIT END -->

<!-- PROJECT RULES START -->

使用 `/herdr`, 创建一个同 Model 同 Agent 的 Session, 实现 SubAgent 功能;

<!-- PROJECT RULES END -->
