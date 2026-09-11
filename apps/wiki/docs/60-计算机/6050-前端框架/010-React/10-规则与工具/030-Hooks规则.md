---
id: 9f3ac960-6095-442e-a753-c4c5e3bcbc02
---

# Hooks 规则

## 为什么 Hook 必须位于稳定的顶层调用位置？

- 状态匹配: React 依赖每次渲染一致的 Hook 顺序关联内部状态，条件或循环导致某次跳过调用后会错配;
- 顶层含义: 放在组件函数或自定义 Hook 的直接执行路径中，并位于可能提前 return 的语句之前;
- 禁止位置: 不在事件处理器、嵌套回调、useMemo 计算、普通 async 函数或类方法中调用 Hook;

```jsx
function Panel({ visible }) {
  const [count, setCount] = useState(0);
  if (!visible) return null;
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

## 只有条件成立时需要某种行为应该怎样写？

- 条件内部化: 仍在顶层调用 Hook，把条件放到 Effect 或计算内部，由 Hook 稳定存在并决定是否执行相应操作;
- 组件拆分: 也可按条件渲染一个独立子组件，让 Hook 属于该子组件自身的稳定调用序列;

```jsx
useEffect(() => {
  if (!enabled) return;
  const unsubscribe = subscribe();
  return unsubscribe;
}, [enabled]); // subscribe 是模块级函数
```

## 普通函数需要 React 状态能力时怎么办？

- 改为自定义 Hook: 如果它需要调用其他 Hook，就在组件或 Hook 顶层使用，并按 use 加大写字母命名;
- 数据传参: 不需要独立 React 能力的计算保持普通函数，直接接收状态作为参数，不为命名方便假装成 Hook;
- 调用环境: 自定义 Hook 不是可以在任意位置调用 Hook 的豁免入口;

## use 为什么允许出现在条件和循环中？

- 专门 API: use 的资源读取契约不同于普通 Hook，可以条件调用，但仍限组件或 Hook 内，不能包在 try/catch 中;
- 边界集中: Promise、Context 和 browser 资源的完整行为见 use 读取资源，不把例外扩大到 useState 等 Hook;

## 如何用检查器发现不稳定调用？

- rules-of-hooks: 检查调用环境与顺序相关模式，自定义 Effect Hook 的依赖检查还需正确配置;
- 运行时补充: 静态检查无法证明全部业务行为，切换条件分支与重复挂载仍应表现一致;
