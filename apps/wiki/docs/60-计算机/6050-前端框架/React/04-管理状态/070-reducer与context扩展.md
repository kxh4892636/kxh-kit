---
id: 2fe26ec9-61ae-4fa2-95c2-cbf008bf4777
---

# reducer 与 context 扩展

如何组合 reducer 和 context 管理复杂屏幕状态？如何封装到单文件？

## 组合思路

- reducer 集中更新逻辑;
- context 向深层组件传递 state 和 dispatch;

## 步骤

1. 创建 context 保存 state 和 dispatch;
2. 用 reducer 管理 state;
3. 在 Provider 中提供 `[state, dispatch]`;
4. 任何子组件用 `useContext` 读取;

```jsx
const TasksContext = createContext(null);
const TasksDispatchContext = createContext(null);

function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(tasksReducer, initialTasks);
  return (
    <TasksContext.Provider value={tasks}>
      <TasksDispatchContext.Provider value={dispatch}>{children}</TasksDispatchContext.Provider>
    </TasksContext.Provider>
  );
}
```

## 自定义 Hook

- 封装读取逻辑: `useTasks()`, `useTasksDispatch()`;
- 让组件代码更清晰;

```jsx
function useTasks() {
  return useContext(TasksContext);
}
```

## 单文件封装

- 把 context、reducer、provider、自定义 Hook 放在一个文件;
- 对外只暴露 Provider 和 Hook, 隐藏实现;

## 好处

- 避免 prop drilling;
- 状态更新逻辑集中;
- 便于测试和替换实现;
