---
id: 1c22e4bb-5673-4246-93bf-396e3d8694a2
---

# Zustand 类型与选择器

## 如何声明 state 与 action 的 TypeScript 类型？

- 接口: 同时描述数据与操作函数, 给调用者完整约束;
- 类型: 用 `create` 的泛型形式写明 store 类型;
- 组合推断: 用 `create<Store>()(...)` 形式;
- 收益: 中间件组合时仍保留类型推断;

```ts
import { create } from "zustand";

interface CounterStore {
  count: number;
  increment: () => void;
  readCount: () => number;
}

const useCounter = create<CounterStore>()((set, get) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  readCount: () => get().count,
}));
```

## Selector 为什么需要稳定的输出引用？

- 稳定快照: 基于外部 store 快照订阅时, 没变化却返回新对象会造成重复更新;
- 注意: Zustand 5 的默认 Hook 尤其需要稳定输出;
- 原始值优先: 只需要 a 时直接选择 a, 不先创建 `{ a }` 包装;
- 浅比较: 组合多个字段时 `useShallow` 可复用浅层相等结果;
- 边界: 它解决不了所有深层新建对象;

```jsx
import { useShallow } from "zustand/react/shallow";

const { count, increment } = useCounter(
  useShallow((state) => ({
    count: state.count,
    increment: state.increment,
  })),
);
```

## 最新 store 值与 React 闭包中的值有什么区别？

- 读取时刻: action 里 `get()` 读的是调用当时的 store;
- 对比: 组件处理器闭包在创建它的那次渲染上;
- 语义选择: 需要最新共享值时在 action 内读;
- 边界: 要保留用户点击时的快照, 就不要硬换成最新值;
- 不自动刷新: get() 不会把已经保存到局部变量的旧值变成新值;
