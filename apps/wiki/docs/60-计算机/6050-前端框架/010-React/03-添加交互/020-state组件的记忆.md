---
id: cadd4906-b74e-4cfc-8483-b955ea8548f9
---

# state：组件的记忆

## 为什么普通局部变量不能保存交互结果？

- 重新执行: React 重新调用组件时会重新创建局部变量，上次调用中的赋值不会自动保留;
- 通知机制: 即使把数据保存在外部，直接赋值也不会通知 React 更新界面;
- State: 同时提供跨渲染记忆与请求重新渲染的能力，适合会影响 UI 的数据;

## 如何声明并更新一份 state？

- Hook 返回值: `useState(initialState)` 返回当前状态与 setter，按 `[value, setValue]` 命名便于识别;
- 更新过程: 事件中调用 setter 提交下一状态，React 再调用组件时交回新值，显示相应 UI;
- 顶层调用: Hook 应位于组件或自定义 Hook 顶层，完整规则见 Hooks 规则;

```jsx
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>点击次数：{count}</button>;
}
```

## 多份 state 如何在渲染间匹配？

- 调用顺序: React 依靠同一组件中稳定的 Hook 调用顺序关联状态，不依靠变量名;
- 分开声明: 彼此独立的值可用多个 useState；总是一起变化的数据是否合并见状态结构笔记;
- 初始化细节: 初始值与惰性初始化的执行次数归属[状态 Hooks](../06-Hooks参考/010-初始化与更新契约.md);

## 相同组件的多个实例会共享 state 吗？

- 实例隔离: 同一个组件在树中出现两次，默认各有一份状态，一个计数器的点击不会直接更新另一个;
- 数据传递: state 是组件私有记忆，父组件或兄弟不能直接读取；需要共享时把值和回调通过 props 连接;

```jsx
function TwoCounters() {
  return (
    <>
      <Counter />
      <Counter />
    </>
  );
}
```

- 身份持续性: 状态能否保留还取决于组件在渲染树中的身份，见[保留与重置 state](../04-管理状态/040-保留与重置state.md);
