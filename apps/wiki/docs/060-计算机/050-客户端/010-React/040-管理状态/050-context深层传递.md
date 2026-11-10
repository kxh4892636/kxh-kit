---
id: ee83dc9a-445b-4f91-96d4-408ac1cfee2f
---

# 用 Context 深层传递数据

## 什么时候需要 Context？

- 层层传递: 多层中间组件只负责转交同一数据时, Context 可以让后代直接订阅祖先提供的值;
- 优先组合: 先用普通 props 或 children 组合, 依赖更明确;
- 适合 Context: 主题、当前用户这类跨层信息;
- 不是状态库: Context 只负责传值;
- 更新方式: 仍由 `useState`、reducer 或其他所有者决定;

## 如何创建并提供一个 Context？

- 创建位置: 在组件外调用 `createContext`;
- 要求: 导出同一个 Context 对象, 给提供者与消费者共用;
- 默认值: 只在上方完全没有对应 Provider 时使用, 是静态后备值, 不会自行变化;
- 提供值: React 19 可用 `<ThemeContext value={theme}>`;
- 范围: 只影响该提供者下面的子树;

```jsx
import { createContext, useContext } from "react";

const ThemeContext = createContext("light");

function Button() {
  const theme = useContext(ThemeContext);
  return <button className={theme}>确认</button>;
}

export default function Panel() {
  return (
    <ThemeContext value="dark">
      <Button />
    </ThemeContext>
  );
}
```

## 消费者如何找到实际读取的值？

- 最近祖先: `useContext` 向上找最近的 Provider;
- 覆盖: 嵌套提供者可对某子树给出不同值;
- 同层陷阱: 组件内调 `useContext` 读不到它返回的 JSX 中刚建的 Provider;
- `undefined`: 上方 Provider 显式给 `undefined` 时读到的就是它, 不会退回默认值;

```jsx
function Screen() {
  return (
    <ThemeContext value="light">
      <Button />
      <ThemeContext value="dark">
        <Button />
      </ThemeContext>
    </ThemeContext>
  );
}
```

- 嵌套结果: 外侧按钮读 `light`, 内侧按钮读 `dark`;
- 结论: 同一 Context 可在不同子树给不同值, 不是全局变量;

## Context 的更新如何传播？

- 比较方式: React 用 `Object.is` 比前后 value;
- 变化时: 更新读取它的后代, 中间组件不读也能传下去;
- Memo 边界: `memo` 不能阻止消费者收到新的 Context;
- 引用稳定性: 对象与函数 value 的问题见 Context 与 Ref 参考;
- 身份一致: 提供与读取必须用同一个 Context 对象;
- 风险: 模块副本重复时, 两端同名却连不上;
