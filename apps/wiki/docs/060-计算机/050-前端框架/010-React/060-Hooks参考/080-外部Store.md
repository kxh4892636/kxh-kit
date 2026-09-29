---
id: 6ac7a13e-2670-4c6d-916a-7140203866b2
---

# 订阅外部 Store

## 如何把 React 外部的数据接入组件？

- useSyncExternalStore: 接收 subscribe、getSnapshot 和可选 getServerSnapshot，返回当前可渲染快照;
- 订阅契约: subscribe 接收通知回调，数据变化时调用它，并返回取消订阅函数;
- 快照契约: getSnapshot 返回不可变值，底层数据没变时必须返回相同快照，不能每次都新建对象;

```jsx
import { useSyncExternalStore } from "react";

function subscribe(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

## 如何保证服务端与水合时的初值一致？

- 服务端快照: getServerSnapshot 在服务端及客户端水合时使用，两端必须给出相同初始内容，必要时把服务端数据序列化到页面;
- 环境隔离: 不在服务端快照中直接访问 navigator、window 等浏览器对象;
- 缺省限制: 需要服务端渲染却没有提供 getServerSnapshot 会报错，应明确仅客户端渲染或补齐初值;

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

## 外部 Store 如何与 Transition 保持一致？

- 提交复核: Transition 提交前 React 会再次读取快照，如果外部数据变化，会以阻塞更新重做，避免页面显示多个数据版本;
- 挂起限制: 不建议依据外部快照直接触发 Suspense，因为外部变更不能像内部状态一样标记为非阻塞 Transition，可能替换已显示内容;
- 默认选择: React 管理的数据优先用 state/reducer，此 Hook 主要桥接现有外部状态系统;
