---
id: d06f43e8-4e45-4ae1-b584-9e04bd87e75f
---

# Context 与 Ref 的边界

## Context value 为什么会造成额外更新？

- 引用变化: 每次渲染新建的对象与函数在 Object.is 比较下不同，即使字段看似一样，也会通知消费者;
- 按需优化: 先确认更新成本，再缓存稳定函数与组合对象，或者拆分不相关 Context；基础传播规则见 Context 主笔记;
- 配置排查: 消费值异常时先检查 Provider 的位置、value 是否遗漏、模块是否重复，不先用缓存掩盖连接错误;

```jsx
function SessionProvider({ user, children }) {
  const logout = useCallback(() => signOut(), []);
  const value = useMemo(() => ({ user, logout }), [user, logout]);
  return <SessionContext value={value}>{children}</SessionContext>;
}
```

- 示例前提: signOut 是模块级函数；如果操作依赖 props 或其他状态，必须补齐真实依赖，而不是保持空数组来追求稳定引用;

## 如何惰性创建 ref 保存的纯对象？

- 参数求值: `useRef(new ExpensiveObject())` 的构造表达式每次渲染都会执行，虽然 React 只使用初次结果;
- 初始化例外: current 为 null 时创建结果可预测且没有外部副作用的对象，这种受控初始化允许在渲染中进行;
- 外部资源: 打开连接或启动播放器等副作用仍由 Effect 建立和清理，不把构造器包装当作纯度豁免;

```jsx
const cacheRef = useRef(null);
if (cacheRef.current === null) {
  cacheRef.current = new Map();
}
```

## 如何只向父组件暴露有限的命令式能力？

- 句柄: `useImperativeHandle(ref, createHandle, dependencies?)` 把自定义对象暴露给父组件，可只开放 focus 而不开放任意 DOM 修改;
- 依赖: createHandle 读取的响应式值纳入数组，变化时重新生成句柄；数组省略时每次渲染都会重新创建;
- Ref prop: React 19 函数组件直接接收 ref，内部另建 DOM ref，二者分别代表公开接口与实现节点;

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

## 什么时候不应该暴露命令式句柄？

- 声明式优先: 能用 open、value 等 props 表达的持续状态，优先由 props 控制，避免父组件调用命令后双方状态不同步;
- 适用操作: 焦点、滚动等一次性操作适合句柄，ref 的一般读写规则见 ref 引用值;
