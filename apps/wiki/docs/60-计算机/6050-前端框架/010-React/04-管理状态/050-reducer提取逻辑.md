---
id: c32bfa84-b1a9-4644-b790-c5b1009048ea
---

# reducer 提取逻辑

## 为什么要用 reducer 提取状态更新逻辑?

- 组件有大量状态更新逻辑分散在事件处理器;
- reducer 把“如何更新 state”集中到单一函数;

## 从 setState 迁移到 reducer 的步骤有哪些?

1. 把 setState 改为 dispatch action;
2. 编写 reducer 函数 `(state, action) => newState`;
3. 组件中使用 `useReducer`;

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "incremented":
      return { count: state.count + 1 };
    default:
      return state;
  }
}

const [state, dispatch] = useReducer(reducer, { count: 0 });
dispatch({ type: "incremented" });
```

## reducer 的纯净性要求有哪些?

- 相同 `(state, action)` 返回相同结果;
- 不要修改 state, 返回新对象;

## useReducer 与 useState 有什么区别?

- useState: 简单局部更新;
- useReducer: 多个关联更新、复杂状态迁移、便于测试;

## 编写 reducer 的规范有哪些?

- action 描述“发生了什么”, 不写 setState;
- 每个 case 返回新 state;
- 可用 Immer 简化嵌套更新;

## 如何调试和测试 reducer?

- reducer 易测试: 直接调用并断言输出;
- 可记录 action 序列;
