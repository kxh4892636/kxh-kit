---
id: 1c22e4bb-5673-4246-93bf-396e3d8694a2
---

# Zustand 最佳实践与 TypeScript

如何用 TypeScript 写 Zustand？有哪些常见坑？

## TypeScript

- 用 interface 描述 store 类型;
- 通过泛型传入 `create<T>`:

```ts
import { create } from "zustand";

interface BearStore {
  bears: number;
  increasePopulation: () => void;
  removeAllBears: () => void;
}

const useBearStore = create<BearStore>((set) => ({
  bears: 0,
  increasePopulation: () => set((state) => ({ bears: state.bears + 1 })),
  removeAllBears: () => set({ bears: 0 }),
}));
```

## 组件只有 action 不重渲染

- 组件只选择 action 函数时, state 变化不会导致该组件重渲染;
- 适合把操作与展示分离;

```jsx
const addModelStatus = useModelsStatus((state) => state.addModelStatus);
// state 变化不会让此组件重渲染
```

## 闭包问题

- React 闭包可能让外部读取到旧 state;
- 在 store action 中使用 `get()` 获取最新值;

```ts
export const useStore = create<Store>((set, get) => ({
  count: 0,
  setCount: (value) => set({ count: value }),
  getCount: () => get().count,
}));
```

## 选择器

- 返回新对象的选择器会导致无限重渲染;
- 需要派生对象时使用 `useShallow` 或返回原始值;

```js
import { useShallow } from "zustand/react/shallow";

const { a, b } = useStore(useShallow((s) => ({ a: s.a, b: s.b })));
```

## 建议

- store 保持扁平;
- 复杂派生逻辑放在 selector 或组件外;
- 服务端状态优先用请求库/缓存, 不塞进 Zustand;
