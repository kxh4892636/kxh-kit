---
id: 581ebcbf-743a-4978-ab68-4f1ed3c07d1b
---

# Harness 工程

## Harness 的定义与边界是什么？

- 定义: **Agent 边界内、模型之外**的运行与治理层，负责协调 Model 与 Environment 的交互;
- 展开式: `Agent = Model + Harness`；`Harness = 上下文管理 + 工具接口 + 约束 + 验证 + 纠正`;
- 展开式定位: 不是与 `Agent = LLM + 上下文 + 工具` 并列的第二套骨架，而是“构建”部分在生产形态下的观察视角;
- 边界: 工具定义、调用适配器、沙箱的权限与重置机制属于 Harness；沙箱内随行动变化的文件与进程、外部数据库、网页、用户及物理世界属于 Environment;
- 澄清: 物理部署位置不决定概念归属——即使仿真环境与 Agent 同进程，它仍是 Environment;

## Harness 五要素各自的职责是什么？

| 功能              | 职责与核心原则                                               | 实际例子                                           | 详见       |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------- | ---------- |
| Context（上下文） | 提供感知信息；信息要充分                                     | 系统提示词、知识库、Agent 状态栏、Sidecar 旁路查询 | 第二、三章 |
| Tools（工具接口） | 提供观察与行动手段；接口要清晰                               | MCP 工具、代码解释器、搜索工具                     | 第四章     |
| Constrain（约束） | 设定行为边界；故障安全默认值，能力默认关闭                   | Claude Code 中每个工具默认需用户授权               | 第四章     |
| Verify（验证）    | 自动判断操作结果对错；只看结构化数据，不看模型自由生成的文本 | Linter、类型系统、工具调用结果校验                 | 第五、六章 |
| Correct（纠正）   | 发现问题时自动修正或回退；确认无法恢复前不暴露中间态         | 静默重试、接续生成、连续失败熔断                   | 第二、五章 |

- 闭环: 上下文与工具让 Agent“能做事”；约束预防错误、验证发现偏差、纠正使闭环形成，三者让它“不做错事”;
- 重要性不对称: 早期框架主要关注上下文与工具；生产级系统的重心已转向约束、验证与纠正;
- 例证: Claude Code 的 Harness 绝大部分代码是保障机制，工具本身只是一小部分——流程状态管理、多层上下文压缩、权限分类、熔断器、错误恢复;

## 生产系统的最小运行骨架长什么样？

```python
observation = Environment.observe()
trajectory = [observation]
while true:
	actions = Model(Harness.build_context(trajectory))
	if len(actions) == 0:
		break
	allowed_actions = Harness.constrain(actions)
	observation = Environment.apply(allowed_actions)
	if not Harness.verify(Environment):
		observation = Harness.correct(Environment)
	trajectory.append(allowed_actions, observation)
```

- 说明: 骨架刻意不展开实现；完整 API 消息循环见第二章，工具与自动验证见第四、五章;

## 工程范式经历了哪五个阶段？

- 提示工程（Prompt Engineering）: 优化自然语言指令以提升输出质量;
- 上下文工程（Context Engineering）: 系统性管理模型能看到的所有信息（系统指令、工具定义、对话历史、外部知识）;
- Harness 工程: 扩展到 Agent 如何组织模型运行并与环境交互，涵盖上下文与工具接口、约束、验证、反馈循环与错误恢复;
- Loop 工程（Loop Engineering）: 从单次运行扩展到跨轮次持续自主运转——谁发现下一件事、何时验证、何时算完成（第十章展开）;
- Graph 工程（Graph Engineering）: 把 Agent 循环、确定性程序与人工审批组织成显式执行图——节点承担能力，边规定路由与依赖，结构化状态沿边传递并在关键边界持久化;
- 关系: 层层包含——提示 ⊂ 上下文 ⊂ Harness ⊂ Loop ⊂ Graph；单个 Agent 循环正是执行图中的一个节点;
- 判断: 当各家模型能力接近、不再是决定性差异时，竞争优势转移到模型之外的工程实践（LangChain 在 Terminal Bench 2.0 上只改 Harness，得分从 52.8% 升到 66.5%，从 30 名开外进入前 5）;

## 构建有效 Agent 的三个核心原则是什么？

- 保持简单: 从最简单方案开始，只在确实必要时增加复杂度；直接的 API 调用优于复杂框架，清晰的代码优于聪明的抽象；每多一层抽象都会成为调试盲区;
- 保持透明: 明确显示规划步骤、执行日志与决策轨迹；这既是调试前提，也是用户建立信任的前提——黑箱里的错误外部观察者无法定位与纠正;
- 设计好工具接口（ACI）: 从 Agent 视角设计接口，而非从程序员视角；命名与参数要直观，容易误用的地方从设计上让错误无法发生;
- 防呆（Poka-yoke）: “用设计消除错误”的制造术语，源自丰田生产体系（SIM 卡缺角、微波炉门未关不加热）;
- 原因: 模型与工具之间唯一的沟通通道就是接口本身，模糊的接口会被模型放大成系统性错误;
