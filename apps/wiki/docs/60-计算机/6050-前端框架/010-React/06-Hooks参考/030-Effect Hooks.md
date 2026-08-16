---
id: 1a673ca4-8755-4254-aa6b-e59a9f41b6a7
---

# Effect Hooks

useEffect、useLayoutEffect、useInsertionEffect、useEffectEvent 的差异与用法。

## useEffect

- 同步外部系统: `useEffect(setup, dependencies?)`;
- setup 返回 cleanup;
- 依赖变化时 cleanup 旧 setup 再执行新 setup;

```jsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);
```

## useEffect 注意

- 依赖数组必须包含所有响应式值;
- 空数组只在挂载后执行一次（开发 StrictMode 会多一次）;
- 不要用 ref 阻止 Effect 执行;
- setup 不能是 async 函数; 异步逻辑用内部 Promise 或另建函数;

```jsx
useEffect(() => {
  let ignore = false;
  async function load() {
    const data = await fetchBio(person);
    if (!ignore) setBio(data);
  }
  load();
  return () => {
    ignore = true;
  };
}, [person]);
```

## useLayoutEffect

- 在浏览器绘制前同步执行;
- 用于测量布局、避免闪烁;
- 会阻塞绘制, 默认优先用 useEffect;

```jsx
useLayoutEffect(() => {
  const height = ref.current.getBoundingClientRect().height;
  setHeight(height);
}, []);
```

## useInsertionEffect

- 在 DOM 变更前同步插入样式;
- 供 CSS-in-JS 库作者使用;
- 不能读取布局或访问 ref DOM;

## useEffectEvent

- 创建非响应式 Effect 事件: `const onEvent = useEffectEvent(callback)`;
- 在 Effect 中调用可读取最新 props/state;
- 不参与依赖, 不能传给其他组件;

```jsx
const onVisit = useEffectEvent((id) => log(id, roomId));
useEffect(() => {
  onVisit(roomId);
}, [roomId]);
```
