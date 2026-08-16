---
id: ee83dc9a-445b-4f91-96d4-408ac1cfee2f
---

# context 深层传递

如何避免 prop drilling？Context 如何创建、提供、使用？

## 问题

- 多层传递 props 很繁琐;
- 许多组件需要同一份数据时, 逐层传低效;

## 创建 Context

- 在组件外调用 `createContext`;

```jsx
const ThemeContext = createContext("light");
```

## 提供 Context

- 用 `<ThemeContext.Provider value={...}>` 包裹子树;

```jsx
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>
```

## 使用 Context

- 用 `useContext(ThemeContext)` 读取;

```jsx
function Button() {
  const theme = useContext(ThemeContext);
  return <button className={theme}>按钮</button>;
}
```

## 中间组件穿透

- context 可跨过中间组件, 不要求每层传递;

## 默认值

- 未提供 Provider 时使用 `createContext(defaultValue)`;
- 默认值只在没有匹配 Provider 时生效;

## 使用前思考

- 先尝试 props 显式传递;
- context 适合“全局”主题、当前用户、路由等;
- 避免滥用导致组件复用性下降;

## 组合

- 可与 reducer 组合管理复杂状态;
- 可拆分为不同 context 减少重渲染;
