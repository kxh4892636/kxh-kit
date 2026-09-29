---
id: bf3ac9c6-1054-4a74-b14f-7a6a322201cf
---

# 自定义 Hook

## 什么时候值得提取自定义 Hook？

- 高层用途: 多个组件需要同一种有状态行为时，用 useOnlineStatus、useChatRoom 等名称表达目的，使调用者不必理解订阅细节;
- 避免机械封装: useMount 等生命周期包装容易隐藏依赖，不如明确“订阅什么、随什么变化”;
- 命名规则: Hook 名以 use 加大写字母开头；不调用 Hook 的普通函数通常不需要 use 前缀;

## 如何正确封装在线状态的订阅？

- 对称监听: 同时订阅 online 与 offline，并在清理时移除两者，不能只监听恢复在线的事件;
- 初值校准: Effect 建立时读取 navigator.onLine，客户端提交后校准；支持一致快照与 SSR 的外部订阅方案见 useSyncExternalStore;

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

- 逻辑复用: 每次调用内部的 useState 都关联各自组件的状态，共享的是实现，不是同一个 state 容器;
- 外部来源: 如果 Hook 订阅同一个外部 store，读到相同数据是该来源共享的结果，不是 Hook 自动把局部状态合并;

## 如何让 Hook 随输入正确重新同步？

- 参数响应: 接收 roomId 等输入并将其纳入内部 Effect 依赖，调用者改变参数时行为随之改变;
- 返回值: 返回调用者需要的数据或操作，避免暴露内部 ref 来绕过生命周期;
- 回调处理: Effect 内非响应式事件可在 Hook 内使用 Effect Event，但不把 Effect Event 跨 Hook 传递;

## 如何判断封装是否保留了原行为？

- 核对场景: 输入变化、重复挂载、卸载和错误路径都应与提取前一致；抽象不能吞掉依赖或清理;
- 规则持续: 自定义 Hook 可组合其他 Hook，但同样遵守顶层调用与纯度约束;
