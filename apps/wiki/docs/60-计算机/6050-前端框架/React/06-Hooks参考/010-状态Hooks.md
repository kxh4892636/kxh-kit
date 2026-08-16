---
id: cf09daf7-6b02-47b6-888c-b3de2e119cd5
---

# 状态 Hooks

useState 和 useReducer 的签名、返回值与使用要点。

## useState

- 声明 state 变量: `const [state, setState] = useState(initialState)`;
- `setState(next)` 或 `setState(prev => next)`;
- 更新触发重渲染;
- 不要直接修改 state;

```jsx
const [count, setCount] = useState(0);
setCount((c) => c + 1);
```

## useState 注意

- 只在顶层调用;
- 初始值可以传函数做惰性初始化: `useState(() => createInitial())`;
- 对象/数组更新需创建新引用;

## useReducer

- 管理复杂状态: `const [state, dispatch] = useReducer(reducer, initialArg, init?)`;
- `dispatch(action)` 把 action 交给 reducer;

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "inc":
      return { count: state.count + 1 };
    default:
      return state;
  }
}
const [state, dispatch] = useReducer(reducer, { count: 0 });
dispatch({ type: "inc" });
```

## useReducer 注意

- reducer 必须纯净;
- 返回新 state, 不修改旧 state;
- 可用第三个参数惰性创建初始 state;

## 选择

- 简单值用 useState;
- 多个关联更新或复杂迁移用 useReducer;
