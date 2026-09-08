---
id: c1d63508-ec4f-4f3b-b248-2555d14770f5
---

# 你可能不需要 effect

## 什么时候不需要 Effect? 核心判断标准是什么?

- 没有外部系统时, 通常不需要 Effect;
- 能通过渲染、事件、派生值解决的, 不用 Effect;

## 如何基于 props/state 更新 state?

- 在渲染期间调整 state 而不是 Effect;

```jsx
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {
  setPrevItems(items);
  setSelectedId(null);
}
```

## 如何缓存昂贵计算?

- 用 `useMemo`, 不用 Effect + state;

## 如何重置或调整 state?

- 用 `key` 重置整个组件;
- 用渲染期间调整代替 Effect 同步;

## 如何在多个事件间共享逻辑?

- 多个事件需要同一逻辑: 抽成普通函数, 在事件中调用;

## 发送 POST 请求应该放在哪里?

- 由用户操作触发的请求应放在事件处理器, 不是 Effect;

## 如何通知父组件 state 变化?

- 优先在事件中调用父组件回调;
- 不要在 Effect 中“因 state 变化”通知父组件;

## 如何订阅外部 store?

- 用 `useSyncExternalStore`, 不是手动 Effect;

## 获取数据应该用什么方式?

- 可用框架数据获取或自定义 Hook;
- Effect 中 fetch 需处理竞态、取消、缓存;
