---
id: bf3ac9c6-1054-4a74-b14f-7a6a322201cf
---

# 自定义 Hook

## 什么时候值得提取自定义 Hook？

- 高层用途: 多个组件需要同一种有状态行为时, 用 `useOnlineStatus` 这类名字;
- 好处: 调用者不必理解订阅细节;
- 好处: 调用者不必理解订阅细节;
- 避免机械封装: `useMount` 这类生命周期包装容易藏住依赖;
- 更好: 明确写清订阅什么、随什么变化;
- 命名规则: Hook 名以 `use` 加大写字母开头;
- 边界: 不调用 Hook 的普通函数通常不需要前缀;

## 如何正确封装在线状态的订阅？

- 对称监听: 同时订阅 `online` 与 `offline`;
- 清理: 两者都移除, 不要只监听恢复在线;
- 初值校准: Effect 建立时读 `navigator.onLine`, 客户端提交后再校准;
- 更完整方案: 支持一致快照与 SSR 的外部订阅见 `useSyncExternalStore`;

```jsx
import { useEffect, useState } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    function update() {
      setIsOnline(navigator.onLine);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return isOnline;
}
```

## 多个组件调用同一个 Hook 会共享状态吗？

- 逻辑复用: 每次调用内部的 `useState` 都关联各自组件的状态;
- 共享的是: 实现, 不是同一个 state 容器;
- 外部来源: Hook 订阅同一个外部 store 时, 读到相同数据是来源共享的结果;
- 澄清: 不是 Hook 自动合并局部状态;

## 如何让 Hook 随输入重新同步？

- 参数响应: 收 `roomId` 等输入并纳入内部 Effect 依赖;
- 结果: 调用者改参数, 行为随之改变;
- 返回值: 返回调用者需要的数据或操作, 避免暴露内部 ref 来绕过生命周期;
- 回调处理: Effect 里的非响应式事件可在 Hook 内用 Effect Event;
- 禁止: 把 Effect Event 跨 Hook 传递;
