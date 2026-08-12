# Design It Twice

当用户想为选定的 deepening 候选项探索备选 interfaces 时, 使用此 parallel sub-agent pattern. 它基于 "Design It Twice"(Ousterhout) - 你的第一个想法不太可能是最好的.

使用 [SKILL.md](SKILL.md) 中的 vocabulary - **module**, **interface**, **seam**, **adapter**, **leverage**.

## 流程

### 1. 界定 problem space

派遣 sub-agents 前, 为选定的候选项编写一份面向用户的 problem space 说明:

- 任何新 interface 都需要满足的 constraints.
- 它将依赖的内容, 以及它们所属的 category(参见 [DEEPENING.md](DEEPENING.md)).
- 用于落地 constraints 的粗略说明性代码草图. 它不是提案, 只是让 constraints 变得具体的方法.

向用户展示这份说明, 然后立即进入第 2 步. 当 sub-agents 并行工作时, 用户可以阅读和思考.

### 2. 派遣 sub-agents

并行派遣至少 3 个 sub-agents. 每个 sub-agent 都必须为 deepened module 产出一个**截然不同**的 interface.

使用独立的 technical brief 提示每个 sub-agent(文件路径, coupling details, [DEEPENING.md](DEEPENING.md) 中的 dependency category, seam 后面的内容). 该 brief 独立于第 1 步面向用户的 problem-space 说明. 为每个 agent 指定不同的 design constraint:

- Agent 1: "最小化 interface, 最多以 1-3 个入口为目标. 最大化每个入口的 leverage."
- Agent 2: "最大化灵活性, 支持多种 use cases 和扩展."
- Agent 3: "为最常见的调用方优化, 让默认情况变得简单."
- Agent 4(如果适用): "围绕 ports & adapters 设计 cross-seam dependencies."

在 brief 中同时包含 [SKILL.md](SKILL.md) vocabulary 和 CONTEXT.md vocabulary, 让每个 sub-agent 都使用与架构语言和项目 domain language 一致的名称.

每个 sub-agent 输出:

1. Interface(types, methods, params, 以及 invariants, 顺序, 错误模式).
2. 展示调用方如何使用它的用例.
3. implementation 隐藏在 seam 后面的内容.
4. 依赖策略和 adapters(参见 [DEEPENING.md](DEEPENING.md)).
5. 权衡, leverage 在哪里高, 在哪里薄弱.

### 3. 展示并比较

依次展示 designs, 让用户逐个理解, 然后用文字比较它们. 按 **depth**(interface 上的 leverage), **locality**(变更集中的位置)和 **seam placement** 进行对比.

比较后给出你自己的推荐: 你认为哪个 design 最强, 以及原因. 如果不同 designs 中的要素可以很好地组合, 提出 hybrid. 明确表达观点, 用户想要的是有力判断, 而不是一份菜单.
