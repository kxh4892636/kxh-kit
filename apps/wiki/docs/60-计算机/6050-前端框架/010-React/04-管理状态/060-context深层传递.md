---
id: ee83dc9a-445b-4f91-96d4-408ac1cfee2f
---

# context 深层传递

## 逐层传递 props 有什么问题?

- 多层传递 props 很繁琐;
- 许多组件需要同一份数据时, 逐层传低效;

## 如何创建 Context?

- 在组件外调用 `createContext`;

```jsx
const ThemeContext = createContext("light");
```

## 如何用 Provider 提供 Context?

- 用 `<ThemeContext.Provider value={...}>` 包裹子树;

```jsx
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>
```

## 如何用 useContext 读取 Context?

- 用 `useContext(ThemeContext)` 读取;

```jsx
function Button() {
  const theme = useContext(ThemeContext);
  return <button className={theme}>按钮</button>;
}
```

## context 如何穿透中间组件?

- context 可跨过中间组件, 不要求每层传递;

## Context 默认值在什么时候生效?

- 未提供 Provider 时使用 `createContext(defaultValue)`;
- 默认值只在没有匹配 Provider 时生效;

## 什么场景适合用 context? 使用前要考虑什么?

- 先尝试 props 显式传递;
- context 适合“全局”主题、当前用户、路由等;
- 避免滥用导致组件复用性下降;
