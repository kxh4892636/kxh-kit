---
id: cf09daf7-6b02-47b6-888c-b3de2e119cd5
---

# 状态 Hooks

## useState 如何声明和更新状态?

- 声明状态: `const [state, setState] = useState(initialState)` 返回当前状态和更新函数, 状态是组件在多次渲染之间保留的数据;
- 直接更新: `setState(next)` 指定下一次渲染使用的状态, 不会立即改变当前执行代码中的 `state`;
- 基于旧值更新: `setState(prev => prev + 1)` 根据待处理的上一状态计算新值, 适合连续累加等更新;
- 触发渲染: 状态更新让 React 重新执行组件函数以更新界面, 新旧值经 `Object.is` 比较相同时通常会跳过重渲染;
- 调用位置: Hook 只能在函数组件或自定义 Hook 的顶层调用, 不能放在条件、循环或嵌套函数中;
- 不可变更新: 不直接修改已有 state, 对象和数组应创建新引用后交给更新函数, 例如 `setUser(prev => ({ ...prev, name: "Ada" }))`;

## useState 的初始值何时计算、何时使用?

- 使用时机: 初始值只在组件挂载、初始化 state 时使用, 后续普通重渲染保留当前 state, 不会被再次传入的初始值覆盖;

| 传参方式                                 | 每次执行组件函数时                             | React 如何使用                                     |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `useState(createInitial())`              | 先调用 `createInitial()`, 再把结果传给 Hook    | 仅初始化时采用结果, 后续忽略                       |
| `useState(() => createInitial())`        | 创建箭头函数, 不会因此执行函数体               | 初始化时调用函数并保存返回值, 后续普通重渲染不调用 |
| `useState(0)` / `useState(initialValue)` | 传入字面量或读取变量, 没有额外的初始化函数调用 | 仅初始化时采用传入值                               |

- 惰性初始化: 把计算交给初始化函数, 让 React 在需要初始状态时执行, 可避免每次渲染重复进行昂贵计算;
- props 变化: `useState(initialCount)` 中的 `initialCount` 即使来自 props, 后续变化也不会自动同步到 state;
- 重新初始化: 组件卸载后重新挂载, 或改变 `key` 使组件重新创建时, 会重新使用初始值;
- Strict Mode: 开发环境下会调用初始化函数两次检查纯度, 忽略其中一次结果, 因此初始化函数不应修改外部数据或执行副作用;
- 参考来源: [React 官方文档: useState](https://zh-hans.react.dev/reference/react/useState);

## useReducer 如何集中管理状态更新与初始化?

- 声明状态: `const [state, dispatch] = useReducer(reducer, initialArg, init?)` 返回当前状态和派发动作的函数, 第三个参数可省略;
- 派发动作: `dispatch(action)` 将描述“发生了什么”的动作交给 reducer, 由它根据当前状态与动作计算下一状态;
- reducer 约束: reducer 是纯函数, 相同输入应得到相同结果且不执行副作用, 更新对象或数组时返回新引用, 不修改旧状态;
- 惰性初始化: 提供第三个参数时用 `init(initialArg)` 的结果初始化状态, 否则直接使用 `initialArg`;

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "inc":
      return { count: state.count + 1 };
    default:
      return state;
  }
}
// 在组件顶层声明, 在事件处理函数中调用 dispatch({ type: "inc" })
const [state, dispatch] = useReducer(reducer, { count: 0 });
```

## useState 与 useReducer 如何选择?

- useState: 适合简单值和独立更新, 写法直接;
- useReducer: 适合多个关联更新或复杂状态迁移, 将更新规则集中到 reducer 中便于理解和维护;
