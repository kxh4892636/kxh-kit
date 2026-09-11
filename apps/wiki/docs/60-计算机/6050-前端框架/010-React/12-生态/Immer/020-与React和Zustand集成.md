---
id: 08de6874-e389-4a59-b496-c2ed8fe1a83c
---

# Immer 的状态管理集成

## 如何把 produce 接入 useState 更新函数？

- 柯里化形式: 只传 recipe 时得到可接收旧状态的函数，适合交给 React setter 处理待更新状态;
- 存在性检查: 查找条目后先确认存在，不让缺失 ID 导致状态更新抛错;

```jsx
import { produce } from "immer";

setTodos(
  produce((draft) => {
    const todo = draft.find((item) => item.id === changedId);
    if (todo) todo.done = !todo.done;
  }),
);
```

## reducer 如何用 Immer 保留 action 语义？

- 责任不变: action 仍表达发生的事件，produce 只简化不可变更新的实现，不承担请求或调度;
- 返回结果: reducer 返回 produce 生成的完整状态，而非只返回修改字段;

```jsx
function reducer(state, action) {
  if (action.type === "added") {
    return produce(state, (draft) => {
      draft.push(action.todo);
    });
  }
  if (action.type === "deleted") {
    return state.filter((todo) => todo.id !== action.id);
  }
  throw new Error("未知动作");
}
```

## Zustand action 怎样使用 produce？

- 更新入口: 把柯里化 producer 交给 set，由它根据当前 store 生成下一状态，避免先捕获一份旧对象再修改;
- 集成选择: 可以显式 produce，也可以使用 Zustand 的 Immer 中间件，项目内保持一种清楚的约定;

```js
import { create } from "zustand";
import { produce } from "immer";

export const useTasks = create((set) => ({
  tasks: [],
  add: (task) =>
    set(
      produce((draft) => {
        draft.tasks.push(task);
      }),
    ),
}));
```

## 集成后哪些约束仍然存在？

- 状态设计: Immer 不会消除重复、矛盾或过深结构，应先设计合理状态再决定是否减少复制样板;
- 生命周期: 不泄漏 draft，不在 updater/reducer 中执行副作用，整体替换规则见 Immer 主笔记;
