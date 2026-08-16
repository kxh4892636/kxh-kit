---
id: d422ff31-d312-4b77-83dd-00c18a6b52f0
---

# Fiber 与调度

Fiber 是什么？React 如何实现可中断渲染和优先级调度？

## Fiber

- React 核心 reconciler 架构;
- 每个组件实例对应一个 Fiber 节点;
- 保存组件类型、props、state、子树信息;

## 可中断渲染

- Fiber 将渲染拆成可中断的小单元;
- 每执行一个单元后可检查更高优先级任务;
- 为并发特性（Transition、Suspense）提供基础;

## 调度

- React 根据优先级调度更新;
- 高优先级更新可打断低优先级渲染;
- 浏览器空闲时继续未完成工作;

## 双缓冲

- 存在 current fiber tree 和 work-in-progress fiber tree;
- 更新在 work-in-progress 上构建;
- 完成后替换 current, 提交到 DOM;

## 与开发者关系

- 开发者通常不直接操作 Fiber;
- 理解 Fiber 有助于理解并发渲染、StrictMode、Transition 行为;
- React 19 仍基于 Fiber;
