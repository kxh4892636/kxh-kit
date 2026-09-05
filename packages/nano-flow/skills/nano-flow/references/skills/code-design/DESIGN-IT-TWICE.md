# Design It Twice

为选定 deepening 候选项探索备选 interfaces 时使用。第一个想法未必最优；术语见 [SKILL.md](SKILL.md)。

## 1. 界定 problem space

向用户展示候选项的 [constraints、依赖类别](DEEPENING.md) 和说明性代码草图，然后立即进入设计。

brief 包含现有 coupling、不可改变的 domain invariants 与全部 constraints，草图未预设某个候选 interface 时完成。

## 2. 派遣 sub-agents

并行派遣至少 3 个 sub-agents，各自输出截然不同的 interface。为每个 agent 提供独立 technical brief：文件路径、coupling、依赖类别、seam 后的内容，以及本 skill 和相关 `CONTEXT.md` vocabulary。它独立于面向用户的 problem-space 说明。

| Agent       | Design constraint                                                |
| ----------- | ---------------------------------------------------------------- |
| 1           | 最小化 interface，以 1–3 个入口为目标，最大化每个入口的 leverage |
| 2           | 最大化灵活性，支持多种 use cases 与扩展                          |
| 3           | 优化最常见调用方，使默认情况简单                                 |
| 4（适用时） | 围绕 Ports & Adapters 设计 cross-seam dependencies               |

每个方案输出 interface（types、methods、params、invariants、顺序、错误）、调用用例、隐藏的 implementation、依赖与 adapters，以及 leverage 的收益和代价。

至少三个方案在 interface shape 或 seam placement 上实质不同，均覆盖完整 brief 且可独立评估时完成。

## 3. 展示并比较

依次展示方案，再按同一组 constraints 比较 depth、locality、seam placement 与依赖策略。明确推荐及理由；可组合时提出 hybrid。

所有方案可沿共同约束比较，推荐的收益与代价清楚，最终选择或待定决策已有记录时完成。
