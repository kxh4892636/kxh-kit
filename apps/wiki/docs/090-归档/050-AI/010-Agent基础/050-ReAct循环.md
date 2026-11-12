---
id: cd6ea1b3-e621-4603-8d4a-07ca1724219d
---

# ReAct 循环

## ReAct 循环由哪三个环节组成？

- 名称: **ReAct**（Reasoning + Acting），名字只体现思考与行动，实际循环含三个环节;
- 思考: 模型先判断当前应该做什么;
- 行动: 调用工具;
- 观察: 读取工具返回结果，并继续思考下一步;
- 形式: “想→做→看→想→做→看”不断重复，直到任务完成;

## 轨迹（trajectory）保存了什么？

- 定义: Agent 执行任务过程中不断积累的消息历史——用户消息、模型回复（含思考过程与工具调用）、工具执行结果;
- 组成: `Agent 的上下文 = 静态前缀 + 轨迹`;
- 增长: 每次调用 LLM 都接收完整上下文，模型的响应又追加到轨迹，供下一次调用使用;
- 过滤: 轨迹中不显示系统提示词与工具定义，它们在每次调用时自动拼接在轨迹前面;

```python
trajectory = [user_request]

repeat:
    context = stable_prefix + trajectory
    decision = Model(context)
    trajectory.append(decision)

    if decision has no tool call:
        return decision.answer

    for call in decision.tool_calls:       # independent calls may run in parallel
        validated_call = Harness.validate(call)
        observation = Environment.execute(validated_call)
        trajectory.append(observation)
```

- 分工: Model 只负责决定下一步，Harness 负责组装上下文、校验并执行工具，Environment 负责产生真实状态变化和观察;
- 退出条件: 无工具调用的响应、调用最终输出工具、遇到错误或达到最大轮数;

## 轨迹为什么能成为可复用资产？

- 可解释与调试: 用户消息、模型回复、工具结果彼此分明，结构清晰;
- 行为分析: 分析大量轨迹可发现行为模式、优化决策路径、改进工具设计;
- 学习闭环: 轨迹可沉淀进知识库，或用于强化学习训练更好的模型;
- 成本提示: 累计缓存读取量随轮数近似二次方增长，需要工程优化;

## “模型即 Agent”改变了什么、没改变什么？

- 范式: 先进模型通过后训练（特别是强化学习）把工具调用能力内化为原生能力，无需人工编排;
- 内化的对象: **强化学习写进参数的是决策**——何时调用工具、调哪个、传什么参数、是否继续、如何串联多次调用;
- 未内化的对象: **工具本身及其执行仍由 Agent 框架或 API 提供**——真实实现、代码沙盒、调用发起与结果回传都在模型之外;
- 结论: 编排循环没有消失，只是决策权交给了模型；循环跑在哪里取决于接入方式（服务端闭环，或客户端 `while` 循环驱动）;
- 价值: 模型越强大，围绕模型构建的 Harness 越关键，因为自主决策空间越大，出错影响面也越大;

## 长链工具调用为什么是 Agent 任务的难点？

- 观察: 多数模型在数十次调用后开始退化;
- 优化方向: 面向长周期任务优化，保持思考一致性;
- 配套能力: 意图澄清——先通过提问弥合“用户说了什么”与“用户真正想要什么”之间的差距，再执行任务;
- 边界: 自由格式工具调用（`type: "custom"`）省去 JSON 转义，属于 API 参数格式演进，客户端循环逻辑不变;
