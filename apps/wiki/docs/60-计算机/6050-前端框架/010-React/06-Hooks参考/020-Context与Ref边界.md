---
id: d06f43e8-4e45-4ae1-b584-9e04bd87e75f
---

# Context 与 Ref 的边界

## Context value 为什么会造成额外更新？

- 引用变化: 每次渲染新建的对象与函数在 Object.is 比较下不同，即使字段看似一样，也会通知消费者;
- context value 变化会重建整个子树;

```jsx
function SessionProvider({ user, children }) {
  const logout = useCallback(() => signOut(), []);
  const value = useMemo(() => ({ user, logout }), [user, logout]);
  return <SessionContext value={value}>{children}</SessionContext>;
}
```

## 如何惰性创建 ref 保存的纯对象？

- 参数求值: `useRef(new ExpensiveObject())` 的构造表达式每次渲染都会执行，虽然 React 只使用初次结果;
- 初始化例外: current 为 null 时创建结果可预测且没有外部副作用的对象;

```jsx
const cacheRef = useRef(null);
if (cacheRef.current === null) {
  cacheRef.current = new Map();
}
```

## 如何只向父组件暴露有限的命令式能力？

- 句柄: `useImperativeHandle(ref, createHandle, dependencies?)` 把自定义对象暴露给父组件，可只开放 focus 而不开放任意 DOM 修改;
- 依赖数组: 同 useEffect;
- Ref prop: React 19 函数组件直接接收 ref，内部另建 DOM ref;

```jsx
import { useImperativeHandle, useRef } from "react";

function SearchInput({ ref }) {
  const inputRef = useRef(null);
  useImperativeHandle(
    ref,
    () => ({
      focus() {
        inputRef.current?.focus();
      },
    }),
    [],
  );
  return <input ref={inputRef} />;
}
```
