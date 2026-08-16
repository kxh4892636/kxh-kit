---
id: cadd4906-b74e-4cfc-8483-b955ea8548f9
---

# state：组件的记忆

为什么需要 state？`useState` 如何工作？state 的隔离性？

## 普通变量不够

- 局部变量在每次渲染后丢失;
- 修改局部变量不会触发重新渲染;

## useState

- Hook: 让组件“记住”信息;
- 返回 `[当前值, 更新函数]`;

```jsx
import { useState } from "react";

function Gallery() {
  const [index, setIndex] = useState(0);
  // ...
}
```

## 更新 state

- 调用 setter 更新值并触发重新渲染;
- 不要直接修改变量;

```jsx
setIndex(index + 1);
```

## 多个 state

- 可声明多个 state 变量;
- React 按 Hook 调用顺序区分它们;

## 隔离与私有

- 每个组件实例拥有独立 state;
- 渲染同一个组件两次, state 不共享;
- state 对子组件不可见（除非通过 props 传递）;

## 首次渲染

- `useState(initial)` 只在首次渲染使用初始值;
- 之后渲染返回当前 state;
