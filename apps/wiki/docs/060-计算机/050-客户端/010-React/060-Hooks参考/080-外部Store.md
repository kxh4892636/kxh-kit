---
id: 6ac7a13e-2670-4c6d-916a-7140203866b2
---

# 订阅外部 Store

## 如何把 React 外部的数据接入组件？

- useSyncExternalStore: 接收 subscribe、getSnapshot 和可选 getServerSnapshot，返回当前可渲染快照;
- 订阅契约: subscribe 接收通知回调，数据变化时调用它，并返回取消订阅函数;
- 快照契约: getSnapshot 返回不可变值，底层数据没变时必须返回相同快照，不能每次都新建对象;

```jsx
const KEY = "count";

function subscribe(callback) {
  window.addEventListener("storage", callback); // 其他标签页写入
  window.addEventListener("local-count", callback); // 当前标签页写入
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("local-count", callback);
  };
}

const getSnapshot = () => localStorage.getItem(KEY) ?? "0";
const getServerSnapshot = () => "0";

export function useCount() {
  return Number(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot));
}

export function increment() {
  localStorage.setItem(KEY, String(Number(getSnapshot()) + 1));
  window.dispatchEvent(new Event("local-count"));
}
```

## 为什么会出现无限渲染或重复订阅？

- 快照未缓存: 返回 `{ ...store }` 会让每次读取都像发生变化，应在数据版本变化时才创建新快照;
- 订阅身份: 每次传入新的 subscribe 函数会重新订阅，能放在组件外时保持稳定，依赖参数时再有意识地更新;

```js
let snapshot = Object.freeze({ count: 0 });
const listeners = new Set();

const counterStore = {
  getSnapshot() {
    return snapshot;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  increment() {
    snapshot = Object.freeze({ count: snapshot.count + 1 });
    for (const listener of listeners) listener();
  },
};
```

- 缓存位置: 示例在真正更新时替换 snapshot，读取函数只返回已有引用，避免读取动作本身被误判为新状态;
