---
id: 08de6874-e389-4a59-b496-c2ed8fe1a83c
---

# Immer 与 React / Zustand 集成

Immer 如何配合 useState 和 Zustand 使用？

## 配合 useState

- 在 setter 中用 `produce` 包裹更新逻辑;

```jsx
import { produce } from "immer";

setTodos(
  produce((draft) => {
    const todo = draft.find((t) => t.id === id);
    todo.done = !todo.done;
  }),
);
```

## 配合 useReducer

- reducer 中使用 produce, 减少不可变样板;

```jsx
function reducer(state, action) {
  switch (action.type) {
    case "added":
      return produce(state, (draft) => {
        draft.push(action.todo);
      });
    default:
      return state;
  }
}
```

## 配合 Zustand

- 在 Zustand action 中用 produce 修改复杂嵌套状态;

```js
import { create } from "zustand";
import { produce } from "immer";

export const useStore = create((set) => ({
  kdramas: [],
  addDrama: (value) =>
    set(
      produce((draft) => {
        draft.kdramas.push(value);
      }),
    ),
}));
```

## 注意

- 在 Zustand 中 `set(produce(...))` 需要返回新状态;
- 避免把 draft 泄漏到 store 外部;
