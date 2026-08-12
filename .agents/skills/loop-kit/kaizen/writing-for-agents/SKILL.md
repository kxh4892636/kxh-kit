---
name: writing-for-agents
description: 为 agents 编写文档. 创建或编辑 skills, 或修改 AGENTS.md 或 CLAUDE.md 时使用.
---

编写任何供 agent 使用的文档时所参考的资料, 包括 skill, `AGENTS.md` / `CLAUDE.md`, 以及通过 pointer 到达的文档. 它们的包装不同, 写法却相同: 同一组杠杆让每一种文档都可预测, 让 agent 每次运行时采用相同的_流程_, 而不是产出相同的结果.

当你编写的文档是 skill 时, 阅读 [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md), 了解 frontmatter, invocation choice 和 router skills.

## Context pointers

**context pointer** 是 agent context 中的一项 reference. 它为某些 context 之外的材料命名, 并编码到达这些材料的条件. skill 的 description 是 context pointer. `AGENTS.md` 中为某份文档命名的一行也是同一种对象. 决定 agent 何时以及多可靠地到达材料的是 pointer 的_措辞_, 而不是它的目标. 必需的目标如果藏在措辞薄弱的 pointer 后面, 就是 variance bug: 先打磨措辞, 只有打磨失败时才将材料 inline.

pointer 做两件事: 说明材料是什么, 列出应该触发到达该材料的 **branches**(branch 是文档处理的一种独立情况, 因此不同运行会在其中采用不同路径). 始终加载的 pointer 中的每个词都会在每一轮产生开销, 因此它比正文更需要严格 pruning:

- **Front-load the leading word** - pointer 正是在这里发挥触发作用.
- **One trigger per branch.** 为同一个 branch 换名的同义词, 只是将一个 branch 写了两遍. 将它们合并, 只保留真正不同的 branches.
- **删除正文已经承载的身份信息.**

## The two loads

你添加的每份文档和每个 pointer 都会消耗以下两种预算之一:

- **Context load** - 始终加载的材料在 agent window 上产生的成本: `AGENTS.md` 中的一行, skill description, 任何每轮都位于 context 中的内容. 无论是否触发, 它们都会消耗 tokens 和注意力.
- **Cognitive load** - 人类承担的成本: 存在哪些文档, 何时应该使用哪一份. 人类就是索引. 这不是要最小化的成本, 而是人的自主性所需的代价. 在 human judgement 重要的地方投入它, 在不重要的地方消除它.

只能通过 pointer 到达的材料, 以 pointer 自身那一行为代价避开 context load. 完全没有 pointer 的材料, 则完全依赖 cognitive load.

## Information hierarchy

文档由两种可自由混合的内容类型构成: **steps**(agent 按顺序执行的动作)和 **reference**(按需查阅的定义, 规则, 事实). 它可以全部由 steps 构成(一份操作步骤), 全部由 reference 构成(review 的规则, 本 skill), 也可以同时包含两者. 核心决策是每项内容位于 **information hierarchy** 的哪一层. 这架 ladder 按 agent 对材料的即时需要程度排序:

1. **In-file step** - 主要层级: agent 按顺序执行的内容.
2. **In-file reference** - 按需查阅. 它通常是合理的扁平同级集合(review 的每条规则位于同一 rung), 这是一种良好安排, 不是 smell.
3. **Disclosed reference** - 被推入独立文件, 通过 context pointer 到达, 仅在 pointer 触发时加载. 它既可以是同一文件夹中的同级文件, 也可以是位于任何地方, 可被任何文档指向的完全 external reference.

向下推得太少, 顶层就会膨胀. 向下推得太多, 就会隐藏 agent 真正需要的材料. 这种张力就是决策的全部.

**Progressive disclosure** 是沿 ladder 向下移动, 离开主文件并进入 pointer 之后, 从而保持顶层清晰. 它主要不是 token 优化, 而是保护 hierarchy 的方式. Branching 是最清晰的 disclosure test: 将每个 branch 都需要的内容 inline, 将只有部分 branches 会到达的内容推到 pointer 后面. 当文档包含 steps 时, 本应 disclosed 的 in-file reference 会埋没它们, 使 agent 是否注意到它们变成抛硬币. 这是一个 variance lever, 而不只是可读性杠杆.

**Co-location** 是文件内部的配套原则: ladder 决定一项内容_向下放多远_, co-location 决定它到达那里后_与什么放在一起_. 将一个 concept 的 definition, rules 和 caveats 放在同一个标题下, 而不是分散各处, 让读者读取一部分时也会带上它的邻居. 判断方式: 文档读起来应该像为 agent 编写的 documentation. 成组的材料如此, 分散的材料则不然.(它与 duplication 不同: duplication 在两处重复同一个含义, scattering 则将一个含义拆散到多处.)

**Sprawl** 是这里的 failure mode: 即使每一行都有效且独一无二, 文档仍然过长. 注意力会被过量内容稀释, 每增加一行, 就多一行需要保持 relevance. 解决方法是 ladder: 将 reference 披露到 pointers 后面, 并按 branch 或 sequence 拆分, 让每条路径只携带自身需要的内容.

## Steps and completion criteria

每个 step 都以 **completion criterion** 结束, 它是告诉 agent 工作已经完成的条件. 两个属性使其成为杠杆:

- **Clarity** - agent 能否区分 done 与 not-done? 模糊的 bound("已经理解")会诱发 **premature completion**: step 尚未真正完成便结束, 注意力滑向_完成这件事_. 前方仍然可见的 steps, 即 **post-completion steps**, 提供拉力. criterion 的 clarity 提供阻力. 按顺序防守: **sharpen the bound first**(局部且便宜). 只有当它无法摆脱模糊, _并且_你观察到赶进度时, 才通过拆分 sequence 隐藏后续 steps. 隐藏只有跨越真实 context boundary 时才有效(hand-off 或 subagent dispatch). inline call 会让后续 steps 留在 context 中, 什么也没有清除.
- **Demand** - 它要求多少. "每个修改过的 model 都已核对"会迫使 agent 做彻底的工作, 而"生成变更清单"不会. Demand 驱动 **legwork**, 即 agent 在工作中进行的挖掘. 它潜藏在措辞中, 而不是被写成独立 step. Demand 也不受 step 限制: "每条规则都已应用"约束一组扁平 reference, 正如"每个 step 都已完成"约束一个 sequence. 因此, 完全由 reference 构成的文档仍能带有穷尽性门槛.

最强的 criteria 既可检查, 又穷尽无遗.

## When to split

将一份文档拆成两份会消耗 two loads 中的一种, 因此只有切分物有所值时才拆分:

- **By sequence** - 当 post-completion steps 诱使 agent 匆忙完成前方 step 时, 拆分这一串 steps. 不让它们出现在视野中, 会驱动 agent 为当前任务投入更多 legwork. 警惕反向操作: 合并 sequences 会让每个 step 的后续 steps 暴露给前面的内容, 从而诱发 premature completion.
- **By invocation** - skill 特有的拆分方式: 参见 [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md).

## Leading words

**leading word** 是一个已经存在于 model pretraining 中的紧凑概念, agent 在运行文档时用它思考(_lesson_, _fog of war_, _tracer bullets_). 将它作为 token 重复, 而不是作为句子重复, 它就会积累分布式定义, 并通过调动 model 已有的 priors, 用最少的 tokens 锚定整个行为区域. 如果定义清晰, 自创新词也能奏效, 但虚构词无法调动 priors. pretrained word 免费提供的内容, 你必须用定义所需的 tokens 补回. 优先寻找现有词语.

它锚定两次. 在正文中锚定_执行_: 每当该词出现, agent 都会采用相同行为. 在扁平 reference 中, 它将注意力聚焦到一类需要寻找的事物上. 在 pointer 中锚定_invocation_: 当同一个词出现在 prompts, docs 和 codebase 中时, agent 会将这种 shared language 与材料关联起来, 从而更可靠地到达材料.

寻找使用 leading words 进行 refactor 的机会. 在三个位置逐项写出的 triad, 用一个句子指向一种想法的 pointer, 每一处都在恳求被压缩成单个 token:

- "快速, 确定, 低开销" → _tight_(一个 _tight_ loop).
- "一个你信得过的 loop" → _red_. 模糊门禁变成二元可观察状态(loop 在 bug 上变成 _red_, 或者没有).

你赢了两次: tokens 更少, agent 用来挂住思考的钩子更锋利. 假设每份文档都带有可以被 leading words 淘汰的重复表述, 去找出它们.

**Negation** 是此杠杆旁边的 failure mode: 通过禁止来引导, 会将被禁止的行为拉入 context, 使它变得_更加_可用, 而不是更少. _不要想一头大象_, 结果满脑子都是大象. negation 是一个弱修饰语, 会被强激活的概念淹没, 所以禁令有一半读起来像执行该行为的 instruction. Prompt **positive**: 陈述目标行为("编写单行 comments"), 让被禁止的行为根本不被说出. 只有无法用 positive 方式表达的 hard guardrail, 才值得使用 prohibition. 即使如此, 也要将它与 positive target 配对, 让注意力落在应该做什么上.

## Pruning

- 将每个含义保存在一个 **single source of truth** 中: 一个权威位置, 使行为变更成为单点编辑. **Duplication** 是在多个位置表达同一个含义, 它会消耗维护成本和 tokens, 并将某个含义在 ladder 上的重要性膨胀到超过它的真实层级.(它是 leading word 的意外反面. leading word 刻意重复 token, 绝不重复含义.)
- **environment** 也是 source of truth, 例如 `package.json` scripts, config files, directory layout, `--help` output. 重述这些内容的文档是 **cache**: lookup 的副本. 只有 lookup 成本高昂时, 它的 load 才物有所值. Cache agent 无法通过查找获得的内容: 未记录的约定, 选择背后的原因, config 不会坦白的陷阱. 将单文件, 单命令即可完成的 lookups 留给 environment, 它们在那里不会过时.
- 检查每一行的 **relevance**: 它是否仍然关系到文档所做的事情? 一行内容会因为从未关系到任务(纯粹说明, 或本应 disclosed 的 branch), 或随着它描述的行为或世界变化而过时, 从而失去 relevance. 较短的文档更容易保持 relevance. 如果没有 pruning discipline, 默认结局就是 **sediment**: 因为添加令人安心, 删除令人不安, 过时层不断沉积, 直到你必须像钻取岩芯一样穿过它们, 才能找到仍然有效的内容.
- 逐句寻找 **no-ops**: model 默认已经遵守的 instruction 会付出 load, 却什么也没说. 判断方式是, 相较于默认行为, 它是否改变行为? 这个判断与 model 相关, 而不是与读者相关. 两个人对某个 no-op 持不同意见, 是因为他们对默认行为持不同意见. 应通过运行文档解决, 而不是通过辩论解决. 如果句子未通过判断, 删除整句, 而不是削减其中的词. 该判断也会评价 leading words: 太弱而无法战胜默认行为的词(agent 已经相当 thorough 时使用 _be thorough_)就是 no-op. 解决方法是使用更强的词(_relentless_), 而不是换一种技巧.
