---
id: ff69c995-142b-4ce4-9c42-8a4e47263a54
---

# useState 实现原理

## useState 的 Hook 记录是如何存储与匹配的?

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

## useState 的 setter 本质是什么?

- setter 可看作 reducer 分发器;
- 传值时: 直接替换状态;
- 传函数时: 基于最新状态计算;

```js
function basicStateReducer(state, action) {
  return typeof action === "function" ? action(state) : action;
}
```

## useState 的更新队列是如何工作的?

- setter 把更新放入队列;
- 下一次渲染按顺序处理队列;

## useState 与 useReducer 的关系是什么?

- `useState` 可视为内置 reducer 的 `useReducer`;
- `useReducer` 允许自定义更新逻辑;
- 两者共享 Hook 调度机制;

## useState 的调用顺序约束与注意事项有哪些?

- 调用顺序不能变, 否则链表错位;
- 这就是 Rules of Hooks 的底层原因;
