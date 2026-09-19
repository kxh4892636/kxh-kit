---
id: 79bca2ad-9060-4c8c-8c27-e522f162e93b
---

# 策略梯度与 PPO/GRPO

## 策略梯度的最小直觉是什么？

- 核心: 让模型对同一个问题多生成几条回答，奖励高的回答就提高它出现的概率、奖励低的就降低——“奖励高的方向多走，奖励低的方向少走”;
- PPO: 在概率比超出指定区间时裁掉代理目标中的额外收益，抑制大幅更新；它不是对策略变化的硬约束;
- 带价值网络的 PPO: “带价值网络”指用价值网络估计基线、算出更细的优势;
- GRPO（Group Relative Policy Optimization）: 不训练价值网络，而是用“同一问题的多条回答互相比较”来判断每条的相对好坏;
- 训练循环（省略采样并行、KL 正则与优化器细节，只标出一次 rollout 到参数更新的因果链）:

```python
for prompt in batch:
    group = [rollout(policy, env.reset(prompt)) for _ in range(G)]
    rewards = [verify(trajectory) for trajectory in group]
    advantages = normalize_within_group(rewards)       # GRPO baseline
    update(policy, group, advantages)
```

- PPO 的裁剪目标与价值网络:

```python
for trajectory in rollouts:
    returns = discounted_returns(trajectory.rewards)
    values = value_model(trajectory.states)
    advantages = returns - stop_gradient(values)
    ratio = exp(policy.log_prob(trajectory.actions)
                - old_policy.log_prob(trajectory.actions))
    policy_loss = -mean(min(
        ratio * advantages,
        clip(ratio, 1 - epsilon, 1 + epsilon) * advantages
    ))
    value_loss = mean((value_model(trajectory.states) - returns) ** 2)
update(policy, value_model, policy_loss + value_coef * value_loss)
```

- `old_policy`: 生成这批 rollout 时冻结的策略快照，概率比用它衡量当前策略已经移动了多远;
- 共同前提: 两者都仍依赖可靠的环境与奖励;

## GRPO 的一次训练迭代由哪四步组成？

- 例子任务: 某个 Python 项目的 `parser.py` 在输入为空时会触发 `IndexError`，要求 Agent 修复代码且不能修改测试;
- 第一步，让策略模型重复尝试: 把同一份初始代码、同一条问题描述分别复制到 16 个相互隔离的沙箱，让模型独立解决 16 次;
- rollout 的含义: 一次完整的“阅读代码 → 修改文件 → 运行测试 → 提交结果”过程;
- 第二步，计算奖励: 每条 rollout 结束后，验证器在干净环境中应用补丁并运行测试；通过得 1、失败得 0;
- 第三步，计算相对优势: 通过测试的比例高于组内平均得正优势、低于平均得负优势——相对优势说明它相对于同组其他尝试有多好;
- 组内无差异的后果: 若 16 条全部失败或全部成功，大家奖励完全一样，比较不出谁更好，相对优势消失;
- 第四步，用梯度下降更新策略: 把相对优势转成训练损失，计算梯度，由优化器（如 AdamW、Muon）执行更新，提高正优势轨迹中模型所做选择的概率、降低负优势轨迹中选择的概率;
- 学到的东西: 不是把某个成功补丁原样背下来，而是让“先复现问题、检查边界条件、修改实现并运行测试”更容易出现，“掩盖异常、改测试、没有验证就提交”更少出现;
- 度量: 四步合起来构成一次训练迭代（step），训练 100 steps 就是把这个闭环重复约 100 轮;

## 一次 step 的时间成本有多大？

- 瓶颈: 复杂 Agent rollout 会生成数十轮工具调用，即使 16 条并行运行，一个 rollout 阶段的墙钟时间也由最慢的那条决定;
- 估算: 最慢 rollout 约 2,000 秒 + 梯度下降与优化器更新约 600 秒 ≈ 2,600 秒（约 43 分钟）;
- 放大: 连续训练 100 steps 接近 72 小时;
- 对比: SFT 通常只需几小时到几天，RL 常是 SFT 的几十到上百倍;
- 计数口径: 具体框架可能把内部的多个 minibatch 更新另行计数，看训练日志时仍需确认其 `step` 定义;

## PPO、GRPO 与 DPO 的差别是什么？

- 共同闭环: 都用当前策略生成 rollout、计算奖励与优势、更新参数;
- 核心差异: 拿谁来比较;
- GRPO: 直接比较同一问题的多条 rollout，不需要额外的价值模型;
- PPO: 会训练一个价值模型，估计在轨迹的每一步“通常能做到多好”，再判断当前动作是否比这个预期更好，因此更适合需要细粒度信用分配的长轨迹;
- 共同约束: 两者都会限制单次更新幅度，避免模型因为一小批样本突然改变过多;
- DPO: 直接学习事先收集好的“较好回答—较差回答”偏好对，不让当前策略在线生成这组 rollout;
- 算法分工: 算法决定如何比较轨迹和更新参数，奖励决定“什么算成功”，环境和数据决定模型能经历哪些问题;

## 学会“何时不思考”的 RL 实验说明了什么？

- 动机: 大型思考模型对所有问题都生成冗长思维链，在简单问题上造成不必要的开销;
- 已验直觉: NoThinking 模式（用 `<think></think>` 跳过思考）在简单问题上性能相当甚至更好，只有面对困难问题时 Thinking 的优势才显现;
- 组件一（约束优化目标）: 鼓励 NoThinking 的同时确保整体性能不下降;
- 组件二（重要性采样策略）: 平衡 Thinking/NoThinking 样本，解决初始模型几乎总选 Thinking 带来的冷启动问题;
- 重要性采样: 在采样分布偏向某一类样本时，通过给样本加权来“纠正”分布，让学习信号能够公平覆盖所有类别——PPO、DAPO 等 RL 算法都会反复用到这一思想;
- 结果: step 0→300 时 MATH500 准确率 0.8100→0.8180（+0.80 pp）、响应长度 4911.46→1576.62（−67.90%）；GSM8K 为 0.796816→0.818802（+2.20 pp）、1025.24→477.33（−53.44%）；AIME mean@16 为 0.314583→0.310417（−0.42 pp）、12119.51→6402.23（−47.17%）;
- 解读边界: NoThinking 比例为 83.80%、84.15%、56.25%，说明数据集汇总层面存在与难度一致的路由信号，但不能称为逐题“完美难度感知”，也不能声称准确率普遍提升;
- 复用方式: 可与 Prompt 蒸馏互补形成“快—慢双系统”——蒸馏降低需要思考的任务比例，该策略优化剩余任务的触发策略;
