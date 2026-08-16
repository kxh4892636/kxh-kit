---
id: d06f43e8-4e45-4ae1-b584-9e04bd87e75f
---

# Context 与 Ref

useContext、useRef、useImperativeHandle 的签名与用法。

## useContext

- 读取 context: `const value = useContext(SomeContext)`;
- 组件读取最近的 Provider 值;
- 没有 Provider 时返回 `createContext` 默认值;

```jsx
const theme = useContext(ThemeContext);
```

## useContext 注意

- 只读订阅, Provider 值变化会触发消费组件重渲染;
- 不要在条件中调用;

## useRef

- 声明可变引用: `const ref = useRef(initialValue)`;
- 返回 `{ current: initialValue }`;
- 修改 `ref.current` 不触发重渲染;

```jsx
const intervalRef = useRef(null);
intervalRef.current = setInterval(tick, 1000);
```

## useRef 注意

- 不要渲染期间写 `ref.current`;
- 适合 DOM 节点、定时器 ID、非渲染数据;

## useImperativeHandle

- 配合 `forwardRef` 自定义暴露给父组件的 ref 对象;

```jsx
const inputRef = useRef(null);
useImperativeHandle(
  ref,
  () => ({
    focus: () => inputRef.current.focus(),
  }),
  [],
);
```

## useImperativeHandle 注意

- 第二个参数返回暴露的句柄;
- 依赖数组控制句柄更新;
