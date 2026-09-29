---
id: 1c22e4bb-5673-4246-93bf-396e3d8694a2
---

# Zustand 类型与选择器

## 如何声明 state 与 action 的 TypeScript 类型？

- 接口: 同时描述数据和操作函数，让调用者获得完整约束，使用 create 的泛型形式明确 store 类型;
- 组合推断: 使用 `create<Store>()(...)` 形式，便于中间件组合时保留类型推断;

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

- 稳定快照: 使用基于外部 store 快照的订阅时，无变化也不断返回新对象可能造成重复更新；Zustand 5 的默认 Hook 尤其需要稳定输出;
- 原始值优先: 只需要 a 时直接选择 a，不先创建 `{ a }` 包装;
- 浅比较: 需要组合多个字段时 useShallow 可复用浅层相等结果，不能自动解决所有深层新建对象;

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

- 读取时刻: action 中 get() 读取调用当时的 store，而组件处理器闭合在创建它的那次渲染上;
- 语义选择: 操作确实需要最新共享值时在 action 内读取；需要保留用户点击时快照时不要强行改成最新值;
- 不自动刷新: get() 不会把已经保存到局部变量的旧值变成新值;

## 如何控制 store 的职责与数据规模？

- 领域划分: 按一起变化的业务数据组织，避免一个全局对象包办所有表单和页面状态;
- 派生值: 可计算结果尽量从已有状态推导，昂贵计算再按调用模式缓存;
- 服务端数据: 请求缓存、失效和重试通常交给数据层，store 只保存确实需要的客户端共享状态;
