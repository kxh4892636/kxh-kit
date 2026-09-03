# 以 Delegation Depth 和父级局部队列限制递归并发

`pi-nano-subagent` 以 main 的 Delegation Depth 0 为起点，只允许深度 0 和 1 暴露 `subagent`，深度 2 不暴露该工具，且运行边界独立拒绝任何第四层启动。并发上限按每个父 agent 的直接委派分别计算：默认 5，超过上限的调用按可取消 FIFO 排队；这避免父运行占有全树 semaphore permit 并等待后代时产生递归死锁。

## Considered Options

- **最大深度 2 + 父级局部 FIFO（选定）**：支持 `main → sub → subsub`，保持每个委派点有界且不会因嵌套等待形成全局 permit 死锁。
- **全树共享 semaphore**：表面上提供更小的总并发上限，但当全部 permit 被等待 Subagent 结果的父运行占有时，后代无法启动；被拒绝。
- **无递归或仅单层委派**：实现更简单，但不能满足 Subagent 进一步分解独立任务的目标；被拒绝。
- **无并发上限**：不需排队，却允许模型在递归树中无界消耗本机和模型服务资源；被拒绝。

## Consequences

- 工具不可见性减少无效调用，运行时深度校验才是不可绕过的权威门禁。
- `maxConcurrency` 表示每个父 agent 的直接委派上限，而非整棵树上限；取值为 5 时，一棵满载树最多同时存在 5 个深度 1 与 25 个深度 2 Subagent。
- 全局配置只改变每父上限，不改变最大 Delegation Depth；排队调用在取消后不得创建 session。
