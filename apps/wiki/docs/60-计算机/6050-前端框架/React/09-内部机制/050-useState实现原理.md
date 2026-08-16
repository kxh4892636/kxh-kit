---
id: ff69c995-142b-4ce4-9c42-8a4e47263a54
---

# useState 实现原理

useState 底层如何记录状态？setter 为什么有时需要传函数？

## Hook 记录

- React 为每个组件维护 Hook 链表;
- 每次调用 `useState` 生成一条 hook 记录;
- 记录包含状态值和更新函数;
- 多次渲染依赖调用顺序匹配同一条记录;

```js
// 概念模型
const hooks = [];
let hookIndex = 0;

function useState(initial) {
  const current = hooks[hookIndex] ?? { state: initial };
  hooks[hookIndex] = current;
  hookIndex++;
  return [current.state, setState];
}
```

## setter 本质

- setter 可看作 reducer 分发器;
- 传值时: 直接替换状态;
- 传函数时: 基于最新状态计算;

```js
function basicStateReducer(state, action) {
  return typeof action === "function" ? action(state) : action;
}
```

## 批量更新

- setter 把更新放入队列;
- 下一次渲染按顺序处理队列;
- 同一事件多次 set 合并为一次渲染;

## 与 useReducer 关系

- `useState` 可视为内置 reducer 的 `useReducer`;
- `useReducer` 允许自定义更新逻辑;
- 两者共享 Hook 调度机制;

## 注意

- 调用顺序不能变, 否则链表错位;
- 这就是 Rules of Hooks 的底层原因;
