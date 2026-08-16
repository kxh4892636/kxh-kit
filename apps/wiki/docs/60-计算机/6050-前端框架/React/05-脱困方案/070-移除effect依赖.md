---
id: 44694297-b6b7-49ae-85f9-74183e7084aa
---

# 移除 effect 依赖

依赖数组应匹配代码吗？如何减少不必要的依赖？

## 原则

- 依赖应与 Effect 实际读取的响应式值一致;
- 想改变依赖, 先改变代码, 不要抑制 linter;

## 判断依赖

- 若某值不是真正依赖, 证明它不参与同步;
- 把非响应式逻辑移到事件处理器或 Effect Event;

## 常见处理

- 多个无关事情 → 拆分 Effect;
- 读取 state 计算下一个 state → 用更新函数;
- 只想读最新值但不响应 → 用 Effect Event;
- 静态对象/函数 → 移到组件外;
- 动态对象/函数 → 移到 Effect 内部;
- 读取对象原始值 → 只依赖原始值;

```jsx
useEffect(() => {
  const id = setInterval(() => setCount((c) => c + 1), 1000);
  return () => clearInterval(id);
}, []); // 不依赖 count, 使用更新函数
```

## 为什么不要抑制

- 抑制依赖会掩盖过期闭包和不同步 bug;
- ESLint 的 `exhaustive-deps` 帮助保持正确;

## 验证

- 修改后 Effect 是否仍与最新 props/state 同步;
- 重跑次数是否符合预期;
