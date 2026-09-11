---
id: 4ad1e759-ec26-49bc-b40b-7dba924fb20a
---

# 组合 reducer 与 Context

## 如何把共享状态与更新通道一起提供？

- 组合职责: reducer 计算迁移，Context 将当前 state 与 dispatch 传到深层组件，两者解决不同问题;
- 分离通道: 为 state 与 dispatch 各建一个 Context，使只派发动作的组件无需订阅状态值；这不等于阻止所有父渲染;
- 提供者: 把 reducer 与两个 Provider 封装在领域组件中，每个提供者实例有自己的状态;

```jsx
import { createContext, useContext, useReducer } from "react";

const TasksContext = createContext(null);
const TasksDispatchContext = createContext(null);

function reducer(tasks, action) {
  if (action.type === "added") return [...tasks, action.task];
  throw new Error("未知动作");
}

export function TasksProvider({ children }) {
  const [tasks, dispatch] = useReducer(reducer, []);
  return (
    <TasksContext value={tasks}>
      <TasksDispatchContext value={dispatch}>{children}</TasksDispatchContext>
    </TasksContext>
  );
}

export function useTasks() {
  const value = useContext(TasksContext);
  if (value === null) throw new Error("缺少 TasksProvider");
  return value;
}

export function useTasksDispatch() {
  const value = useContext(TasksDispatchContext);
  if (value === null) throw new Error("缺少 TasksProvider");
  return value;
}
```

## 消费组件如何只依赖自己需要的通道？

- 读取组件: 调用 useTasks 得到当前列表，不关心 reducer 的组织位置;
- 操作组件: 调用 useTasksDispatch，在事件中传入 action，不复制一份列表再试图同步;
- 使用前提: 页面在上方包裹 TasksProvider，缺少提供者时立即报告配置错误，避免静默使用空值;

```jsx
function AddTask() {
  const dispatch = useTasksDispatch();
  return (
    <button
      onClick={() =>
        dispatch({
          type: "added",
          task: { id: crypto.randomUUID(), text: "新任务" },
        })
      }
    >
      添加
    </button>
  );
}

function TaskCount() {
  const tasks = useTasks();
  return <p>共 {tasks.length} 项</p>;
}
```

## 如何控制共享模块的边界？

- 领域封装: 把 Context、Provider、消费 Hook 与 reducer 放在同一领域模块，页面只组合能力;
- 多个领域: 应用可有多个相互独立的 reducer/context 对，不必建立一个包办所有状态的全局容器;
