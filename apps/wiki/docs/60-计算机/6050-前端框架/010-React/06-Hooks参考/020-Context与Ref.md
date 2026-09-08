---
id: d06f43e8-4e45-4ae1-b584-9e04bd87e75f
---

# Context 与 Ref

useContext、useRef、useImperativeHandle 的签名与用法。

## useContext 的签名与用法是什么?

- 读取 context: `const value = useContext(SomeContext)`;
- 组件读取最近的 Provider 值;
- 没有 Provider 时返回 `createContext` 默认值;

```jsx
const theme = useContext(ThemeContext);
```

## 使用 useContext 有哪些注意事项?

- 只读订阅, Provider 值变化会触发消费组件重渲染;
- 不要在条件中调用;

## useRef 的签名与用法是什么?

- 声明可变引用: `const ref = useRef(initialValue)`;
- 返回 `{ current: initialValue }`;
- 修改 `ref.current` 不触发重渲染;

```jsx
const intervalRef = useRef(null);
intervalRef.current = setInterval(tick, 1000);
```

## 使用 useRef 有哪些注意事项?

- 不要渲染期间写 `ref.current`;
- 适合 DOM 节点、定时器 ID、非渲染数据;

## useImperativeHandle 的用法是什么?

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

## 使用 useImperativeHandle 有哪些注意事项?

- 第二个参数返回暴露的句柄;
- 依赖数组控制句柄更新;
