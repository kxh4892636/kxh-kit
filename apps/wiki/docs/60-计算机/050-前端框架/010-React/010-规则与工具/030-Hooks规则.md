---
id: 9f3ac960-6095-442e-a753-c4c5e3bcbc02
---

# Hooks 规则

## 为什么 Hook 必须位于稳定的顶层调用位置?

- 状态匹配: React 依赖每次渲染一致的 Hook 顺序关联内部状态，条件或循环导致某次跳过调用后会错配;
- 禁止位置: 不在事件处理器、嵌套回调、useMemo 计算、普通 async 函数或类方法中调用 Hook;

```jsx
function Panel({ visible }) {
  const [count, setCount] = useState(0);
  if (!visible) return null;
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## 只有条件成立时需要某种行为应该怎样写？

- 条件内部化: 仍在顶层调用 Hook，把判断条件放置在 Hook 内部;
- 组件拆分: 也可按条件渲染一个独立子组件，让 Hook 属于该子组件自身的稳定调用序列;

```jsx
useEffect(() => {
  if (!enabled) return;
  const unsubscribe = subscribe();
  return unsubscribe;
}, [enabled]); // subscribe 是模块级函数
```

## use 为什么允许出现在条件和循环中？

- 专门 API: use 的资源读取契约不同于普通 Hook，可以条件调用，但仍限组件或 Hook 内，不能包在 try/catch 中;

## 如何用检查器发现不稳定调用？

- lint 规则;
- 运行时补充;
