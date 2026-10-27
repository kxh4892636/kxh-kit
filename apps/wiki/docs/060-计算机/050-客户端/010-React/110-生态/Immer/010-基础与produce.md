---
id: b7467c02-9741-4e5f-8f05-4286a29c4a7f
---

# Immer 与不可变更新

## Immer 怎样减少嵌套更新的复制代码？

- 工作模型: produce 为旧状态提供 draft 代理，记录修改并生成新状态，未变化部分可以共享引用;
- 使用边界: 修改的是 draft，不是原始 React state，仍遵守不可变更新的目标;

```bash
npm install immer
```

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
