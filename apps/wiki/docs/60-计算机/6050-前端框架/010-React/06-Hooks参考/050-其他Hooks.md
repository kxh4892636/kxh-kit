---
id: 883103b0-0781-4ff7-893a-d585a61266a7
---

# 其他 Hooks

useDebugValue、useId、useSyncExternalStore、useActionState、useOptimistic、use 的用途。

## useDebugValue 如何为 DevTools 添加标签?

- 在自定义 Hook 中给 DevTools 添加标签;
- 可传格式化函数延迟计算;

```jsx
useDebugValue(isOnline ? "在线" : "离线");
```

## useId 如何生成唯一 ID 并支持 SSR?

- 生成唯一 ID, 用于无障碍属性;
- `const id = useId()`;
- 比递增计数器更稳定, 支持 SSR;

```jsx
const id = useId();
<label htmlFor={id}>名称</label>
<input id={id} />
```

## useSyncExternalStore 如何订阅外部 store 并保证快照一致?

- 订阅外部 store: `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`;
- 保证并发特性下读到一致快照;

```jsx
const todos = useSyncExternalStore(store.subscribe, store.getSnapshot);
```

## useActionState 如何管理表单 action 状态?

- 管理 action 状态: `useActionState(fn, initialState, permalink?)`;
- 返回 `[state, action, isPending]`;
- 适合表单提交和 Server Function;

```jsx
const [state, formAction, isPending] = useActionState(updateName, { name: "" });
```

## useOptimistic 如何实现乐观更新?

- 乐观更新: `useOptimistic(value, reducer?)`;
- 返回 `[optimisticState, setOptimistic]`;
- 在 pending action 期间显示临时新值;

```jsx
const [optimisticCount, addOptimistic] = useOptimistic(count);
```

## use 如何读取 Promise 或 context? 与 Hooks 规则有何不同?

- 读取 Promise 或 context 的值: `const value = use(resource)`;
- 可在条件/循环中调用（与 Hooks 规则不同）;
- Promise 未完成时配合 Suspense;

```jsx
const message = use(messagePromise);
```
