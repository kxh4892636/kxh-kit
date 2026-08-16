---
id: 643af3c2-05e0-4e5a-81dd-d8b05b2e3ea9
---

# 性能 Hooks

useMemo、useCallback、useTransition、useDeferredValue 的用途。

## useMemo

- 缓存昂贵计算结果: `const result = useMemo(() => compute(a, b), [a, b])`;
- 依赖未变时跳过重算;
- 不要滥用, 先确认计算昂贵;

```jsx
const visible = useMemo(() => filterTodos(todos, tab), [todos, tab]);
```

## useCallback

- 缓存函数引用: `const fn = useCallback(() => doSomething(a), [a])`;
- 配合 `memo` 子组件减少重渲染;
- 类似 `useMemo(() => fn, deps)`;

```jsx
const handleClick = useCallback(() => setCount((c) => c + 1), []);
```

## useTransition

- 标记非紧急更新: `const [isPending, startTransition] = useTransition()`;
- 在 `startTransition` 内 setState 可被中断, 保持 UI 响应;

```jsx
const [isPending, startTransition] = useTransition();
startTransition(() => setTab("comments"));
```

## useDeferredValue

- 延迟更新某值: `const deferred = useDeferredValue(value)`;
- 让旧内容先显示, 新内容后台渲染;

```jsx
const deferredQuery = useDeferredValue(query);
```

## 注意

- React Compiler 可自动处理许多手动 memo;
- 优化前先用 Profiler 测量;
