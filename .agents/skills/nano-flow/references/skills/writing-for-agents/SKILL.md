---
name: writing-for-agents
description: 编写或优化 skill、AGENTS.md、CLAUDE.md 及其引用文档时使用；检查 context pointers、信息层级、完成标准与 pruning。
---

让 agent 稳定采用同一流程，同时允许结果随任务变化。编写 skill 时另读 [SKILL-MECHANICS.md](SKILL-MECHANICS.md)，处理 frontmatter、invocation 与 router。

## Context pointers

**Context pointer** 为 context 外的材料命名，并说明何时读取。skill description 和 `AGENTS.md` 中的文档引用都是 pointer。**Branch** 是需要不同处理路径的独立情况。

可达性取决于 pointer 的措辞。必需材料未被可靠读取时，先强化 pointer；无效后才 inline。始终加载的 pointer 每轮都消耗 context，应比正文更严格 pruning：

- **Front-load the leading word**：把触发概念放在前面。
- **One trigger per branch**：合并同一分支的同义触发，保留独立分支。
- 只写材料与触发条件，删除正文已有的身份说明。

## The two loads

- **Context load**：始终加载的指令、description 和 pointer 消耗的 tokens 与注意力，无论是否触发。
- **Cognitive load**：人类记住有哪些文档、何时使用它们的成本。在需要人类判断处投入，在其余位置消除。

只能通过 pointer 到达的材料，常驻成本仅为 pointer；完全没有 pointer 的材料依赖人类索引。拆分文档会增加其中一种成本，收益须足以抵偿。

## Information hierarchy

文档可由顺序执行的 **steps**、按需查阅的 **reference** 或两者组成。按即时需要安排层级：

1. **In-file step**：执行主线。
2. **In-file reference**：文件内的定义、规则与事实；同级规则组成扁平集合是合理结构。
3. **Disclosed reference**：独立文件，通过带触发条件的 pointer 读取；可位于同目录或外部。

**Progressive disclosure** 保护主线：所有分支都需要的内容 inline，只有部分分支需要的内容下沉。下沉过少会埋没步骤，下沉过多会隐藏必需材料；按分支需要决定。

**Co-location** 决定同层内容如何聚合：把同一概念的定义、规则与 caveats 放在一起。含义分散是 scattering；含义重复是 duplication。

**Sprawl** 指内容虽各自有效，整体仍因过长而稀释注意力。按 branch 或 sequence 下沉 reference，使每条路径只携带所需内容。

## Loops and workflows

**循环（loop）** 是反复出现且有可辨认起止边界的活动。

**工作流（workflow）** 是指导循环每次运行的规格；可规定固定步骤、提供现场派生步骤的上下文，或混合两者。

一份工作流只规格化一个循环，结构由循环决定。先明确触发、输入、前置条件、结束边界、输出与完成证据，再组织步骤和上下文。

## Steps and completion criteria

每个 step 以 **completion criterion** 结束；最强的 criterion 可检查且穷尽：

- **Clarity**：能区分 done 与 not-done。模糊界限会诱发 **premature completion**，可见的后续步骤（**post-completion steps**）又会拉动 agent 提前收尾。先 **sharpen the bound**；只有界限仍模糊且已观察到赶进度时，才拆分 sequence。
- **Demand**：措辞要求的挖掘深度（**legwork**）。“每个修改过的 model 都已核对”比“生成变更清单”要求更完整。Demand 同样适用于 reference：逐条应用全部适用规则，无须另造步骤。

## When to split

- **By sequence**：拆分会拉动提前收尾的后续步骤。隐藏只有跨越真实 context boundary（hand-off 或 subagent dispatch）才有效；inline call 仍保留后续步骤。合并 sequence 也会重新暴露这种拉力。
- **By invocation**：独立触发是否值得增加常驻 description，见 [SKILL-MECHANICS.md](SKILL-MECHANICS.md)。

## Leading words

**Leading word** 用紧凑概念锚定行为。优先选择已有概念（如 _lesson_、_fog of war_、_tracer bullets_），调用 model 的 priors；自造词需自行承担定义成本。

在正文中用它锚定执行，在 pointer 中锚定 invocation；让 prompt、文档和代码共享同一术语。重复 token，积累分布式定义，避免重复解释。逐项寻找可由一个概念替代的句子或重复属性：

- “快速、确定、低开销” → _tight_ loop。
- “信得过的 loop” → _red_：loop 是否在目标 bug 上实际失败。

**Prompt positive**：直接陈述目标行为。否定句会激活被禁止的行为；只有无法正向表达的 hard guardrail 才保留禁令，并配上正向目标。

## Pruning

- **Single source of truth**：每个含义只有一个权威位置，使行为变更成为单点编辑。Duplication 增加 tokens、维护成本，并夸大规则在层级中的权重。
- **Environment** 也是事实源：`package.json` scripts、配置、目录与 `--help` 可直接查明的内容属于 lookup。文档重述是 cache，仅在 lookup 成本高时保留；优先记录环境无法解释的约定、理由和陷阱。
- **Relevance**：逐行检查是否仍服务当前文档。无关说明、应下沉的分支和过时规则都需处理；持续 pruning，避免过时层积成 **sediment**。
- **No-ops**：相较 model 默认行为没有改变的指令，删除整句。判断依赖具体 model，应以运行文档解决分歧。过弱的 leading word 也可能是 no-op，应换成能改变行为的词（如从 _be thorough_ 到 _relentless_）。
