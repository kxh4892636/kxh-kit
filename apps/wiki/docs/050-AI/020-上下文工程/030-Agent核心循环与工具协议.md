---
id: 39be2f73-88f1-4c1a-baed-0ba063e346ec
---

# Agent 核心循环与工具协议

## 一次带工具调用的多轮交互经历哪些步骤？

- 场景: 用户问 “What's the current time and weather in Vancouver?”，模型无法凭自身知识回答;
- 第 1 次调用: 框架发送 system + user 两条消息，附带开发者预先注册的 `tools` 清单;
- 工具拆解: 拆成“查时间、查天气”发生在模型一侧，即响应里的 `tool_calls`，而不是框架预先拆的;
- 模型响应: `content: null` 加两个工具调用请求，仅发出请求，不执行;
- 框架执行: 真正调用时间 API 与天气 API，把结果封装成 `role: "tool"` 消息;
- 第 2 次调用: 请求包含第 1 次的全部消息 + 第 1 次的 assistant 消息 + 新增的两条 tool 消息 + 同一份 `tools`;
- 最终回复: 模型判断信息足够，返回纯文本 assistant 消息，循环结束;
- 追加追问: 用户再问“那东京呢？”时，框架把追问追加到历史末尾，重新开始循环;
- 分工: **模型负责决策（调什么工具、传什么参数），Agent 框架负责执行**;

## 并行与串行工具调用如何决定？

- 并行条件: 每个工具的参数都能直接确定，且结果互不依赖（时区参数、城市与单位均可直接给出）;
- 并行收益: 模型在一次输出中同时生成多个调用请求，框架检测后可并行执行，形成流水线加速;
- 串行条件: 后一个工具的参数必须来自前一个工具的结果;
- 串行实现: 模型在后续一轮中再发起调用，两个工具只能串行;

## 最小 Agent 循环的代码骨架是什么？

```python
while True:
    response = client.chat.completions.create(model=..., messages=messages, tools=tools)
    assistant_message = response.choices[0].message
    messages.append(assistant_message)          # 无论文本还是 tool_calls 都追加
    if not assistant_message.tool_calls:
        break                                    # 无工具调用即为最终回复
    for tool_call in assistant_message.tool_calls:
        result = execute_tool(tool_call.function.name, tool_call.function.arguments)
        messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": result})
```

- 核心逻辑: 返回 `tool_calls` 就执行并继续循环，没有就输出结果并退出;
- 必须加固: 生产代码要设置 `max_iterations` 上限，否则 Agent 可能永远重复同一批工具调用;
- 轨迹增长: 每轮都向 `messages` 追加模型的回复和工具结果，列表单调变长;
- 对接: 这正是 [ReAct 循环](../010-Agent基础/050-ReAct循环.md) 在 API 层面的具体实现;

## 本地小模型能否可靠完成工具调用？

- 实验结论: 0.6B（六亿）参数的超小模型在合理提示词与系统架构下也能可靠完成工具调用;
- 性能: 在苹果 M2 芯片上生成速度超过每秒 100 个 token，足够实时交互;
- 思考过程: 支持思维链的模型（如 Qwen3）先在 `<think>` 标签内分析意图、评估工具、规划顺序;
- 输出顺序: 先内部思考，再给用户的文本回复，最后工具调用请求;
- 流式优化: 出现 `<think>` 即可切到“思考中”状态；首个工具调用参数完整并通过校验即可立即执行，无需等待后续调用生成;
- 端侧前景: 高端移动设备已能运行 0.6B 级模型，端侧 Agent 的时代比多数人预期更近;
- 观察: 修改系统提示词后首次响应变慢，正是 [KV Cache 前缀失效](./050-KVCache原理与约束.md) 的现象;

## 从 API 视角，上下文如何分层布局？

```python
stable_prefix = system_message + core_tool_schemas   # 静态前缀，逐字稳定
trajectory    = load_message_history(session)         # 动态轨迹，只追加
status_message = make_status_message(derive_current_state(trajectory))
if estimated_tokens(...) > budget:
    trajectory = compress_old_evidence(trajectory, preserve=[decisions, constraints, failures, citations])
request.messages = [stable_prefix] + trajectory + [status_message]
```

- 静态前缀: System Prompt 与工具定义在整个对话过程中保持不变，跨请求可复用缓存;
- 动态轨迹: 用户消息、模型回复、工具结果随交互增长，是压缩与管理的对象;
- 状态尾插: 当前状态放在轨迹尾部，让模型不必从长历史中重新推导;
- 原则: “前面不能动、后面可以压缩”，这是后续缓存优化与压缩技术的共同基础;
