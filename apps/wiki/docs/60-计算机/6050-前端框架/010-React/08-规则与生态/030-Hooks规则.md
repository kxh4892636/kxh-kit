---
id: 9f3ac960-6095-442e-a753-c4c5e3bcbc02
---

# Hooks 规则

## Hook 为什么只能在顶层调用?

- 不要在循环、条件、嵌套函数中调用 Hook;
- 提前 return 之前调用所有 Hooks;

```jsx
function Bad({ cond }) {
  if (cond) {
    const [x] = useState(0); // 错误
  }
}
```

## Hook 只能从哪些函数调用?

- 从 React 组件或自定义 Hook 调用;
- 不要从普通 JavaScript 函数调用;

```jsx
function useFriend() {
  const [online] = useOnlineStatus(); // 自定义 Hook 可调用
}
```

## Hooks 规则为什么重要?

- React 依赖调用顺序在多次渲染间匹配 state;
- 动态调用会破坏内部关联;

## Hooks 规则有哪些工具检查?

- ESLint `rules-of-hooks` 自动检查;
