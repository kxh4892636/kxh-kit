---
id: ed9fcc67-48d4-41b5-8844-2382b6d84557
---

# 区分事件与 effect

## 事件处理器与 Effect 的选择标准是什么?

- 事件处理器: 响应用户特定交互, 只运行一次;
- Effect: 响应同步需求, 依赖变化时重新运行;

## 事件处理器与 Effect 的响应式逻辑有何区别?

- Effect 内读取的 props/state 是响应式依赖;
- 事件处理器内的逻辑不是响应式, 不参与 Effect 依赖;

## Effect 只响应部分值变化时会遇到什么问题?

- 希望 Effect 只在某些值变化时重跑, 但内部读取另一个“最新值”;
- 若把最新值加入依赖会过度重跑, 不加入会被 linter 警告;

## useEffectEvent 是什么? 有什么作用?

- `useEffectEvent` 创建非响应式函数, 可从 Effect 中调用;
- 总是读取最新 props/state, 但不触发重新同步;

```jsx
const onVisit = useEffectEvent((visitedId) => {
  logVisit(visitedId, roomId);
});

useEffect(() => {
  const conn = createConnection(roomId);
  conn.connect();
  return () => conn.disconnect();
}, [roomId]);
```

## Effect Event 有哪些限制?

- Effect Event 只能在 Effect 内部调用;
- 不要传给其他组件或 Hooks;
- 它不是稳定引用, 不应用于依赖数组;

## 不想抑制 linter 时有哪些替代方案?

- 不要通过禁用 linter 绕过依赖;
- 先尝试移动非响应式逻辑到事件处理器;
