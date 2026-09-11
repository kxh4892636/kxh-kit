---
id: ee83dc9a-445b-4f91-96d4-408ac1cfee2f
---

# 用 Context 深层传递数据

## 什么时候需要 Context？

- 层层传递: 多层中间组件只负责转交同一数据时，Context 可以让后代直接订阅祖先提供的值;
- 优先组合: 使用前先评估普通 props 或 children 组合，它们能更明确地表达依赖；主题、当前用户等跨层信息常适合 Context;
- 不是状态库: Context 负责传递值，值如何更新仍由 useState、reducer 或其他所有者决定;

## 如何创建并提供一个 Context？

- 创建位置: 在组件外调用 createContext，导出同一个 Context 对象供提供者与消费者使用;
- 默认值: 只在上方完全没有对应 Provider 时使用，是静态后备值，不会自行变化;
- 提供值: React 19 可用 `<ThemeContext value={theme}>`，值只影响这层提供者下面的子树;

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

- 最近祖先: useContext 向上寻找最近的对应 Provider，嵌套提供者可以覆盖某一子树的值;
- 同层陷阱: 在组件中调用 useContext，不会读到该组件在返回 JSX 中刚创建的 Provider;
- Undefined: 上方 Provider 显式提供 undefined 时读到的就是 undefined，不会退回默认值;

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

- 嵌套结果: 外侧按钮读取 light，内侧按钮读取 dark；同一 Context 可在不同子树提供不同值，而不是一个全局可变变量;

## Context 的更新如何传播？

- 比较方式: React 用 Object.is 比较前后 value，变化时更新读取它的后代，即使中间组件不读取也能传递;
- Memo 边界: memo 不能阻止消费者收到新的 Context；对象和函数 value 的引用稳定性问题见 Context 与 Ref 参考;
- 身份一致: 提供与读取必须使用同一个 Context 对象，重复模块副本可能让两端看似同名却无法连接;
