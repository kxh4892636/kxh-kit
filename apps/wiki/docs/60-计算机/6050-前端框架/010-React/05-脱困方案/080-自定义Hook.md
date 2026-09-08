---
id: bf3ac9c6-1054-4a74-b14f-7a6a322201cf
---

# 自定义 Hook

## 自定义 Hook 有什么作用?

- 在组件间共享有状态逻辑;
- 抽取网络请求、定时器、表单状态等;

## 如何从组件中提取自定义 Hook?

- 把组件中相关逻辑移动到以 `use` 开头的函数;
- 函数内部可使用其他 Hooks;

```jsx
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const handler = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, []);
  return isOnline;
}
```

## 自定义 Hook 的命名有什么要求?

- 必须以 `use` 开头;
- 这样 React 和 linter 能识别为 Hook;

## 自定义 Hook 共享的是逻辑还是 state?

- 每次调用 Hook 都获得独立 state;
- Hook 不共享 state 本身, 只共享逻辑;

## 如何向自定义 Hook 传递响应式值?

- 可接收 props/state 作为参数;
- 返回新值或函数;

```jsx
function useInterval(callback, delay) {
  useEffect(() => {
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}
```

## 自定义 Hook 要遵守哪些规则?

- 自定义 Hook 也遵守 Rules of Hooks;
- 只能在组件或自定义 Hook 顶层调用;

## 什么时候该抽自定义 Hook?

- 多个组件重复同一复杂逻辑;
- 聚焦具体高层用例, 不要过度抽象;
