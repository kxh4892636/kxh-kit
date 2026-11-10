---
id: c32bfa84-b1a9-4644-b790-c5b1009048ea
anki: false
---

# 用 reducer 提取状态逻辑

## 哪些更新适合集中到 reducer？

- 适用信号: 多个事件都维护同一组状态规则;
- 症状: setter 分散后, 难追踪发生什么导致怎样变化;
- 职责分离: 事件处理器描述发生的动作;
- reducer: 按旧 state 与 action 算出新 state;
- 取舍: 简单独立值用 `useState` 更直接;
- 复杂迁移: 用 reducer, 更易读懂、调试与独立验证;

## 如何从 setter 迁移到 action？

- 事件描述: 用 `type` 表达一次完整的用户动作;
- 载荷: 携带计算所需数据;
- 反例: 不把 action 限定为设置某字段;
- 提取计算: 把原处理器中的状态转换移到 reducer, 再用 dispatch 代替 setter;

```jsx
import { useReducer } from "react";

function tasksReducer(tasks, action) {
  switch (action.type) {
    case "added":
      return [...tasks, { id: action.id, text: action.text }];
    case "deleted":
      return tasks.filter((task) => task.id !== action.id);
    default:
      throw new Error("未知动作：" + action.type);
  }
}

function TaskList() {
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  return (
    <button
      onClick={() =>
        dispatch({
          type: "added",
          id: crypto.randomUUID(),
          text: "新任务",
        })
      }
    >
      已有 {tasks.length} 项，添加任务
    </button>
  );
}
```

## reducer 为什么只能做纯状态转换？

- 纯函数: 不发请求, 不生成依赖外部时机的随机 ID, 不改旧 state;
- 做法: 在事件里备好数据, 通过 action 传入;
- 完整返回: 每条合法分支都返回下一状态, 漏 `return` 会让状态变成 `undefined`;
- 未知动作: 要明确处理;
- 调试方法: 记录 action 及前后状态即可复现迁移, 也可直接调用 reducer 验证输入输出;

## 如何避免重复计算初始状态？

- 惰性初始化: `useReducer(reducer, initialArg, init)` 只在初始化时用 `init` 算初始 state;
- 执行与引用契约: 见状态 Hooks;
- 边界: reducer 只集中更新规则, 不自动跨组件共享;
- 组合 Context: 见下一篇;
