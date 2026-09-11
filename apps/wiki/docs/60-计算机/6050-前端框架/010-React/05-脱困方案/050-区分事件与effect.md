---
id: ed9fcc67-48d4-41b5-8844-2382b6d84557
---

# 区分事件与 Effect

## 如何根据原因选择事件处理器或 Effect？

- 特定交互: 发送消息是“用户点击发送”的结果，放在事件处理器中；只改变房间或主题不应再次发送;
- 持续同步: 聊天连接需要随当前 roomId 保持一致，即使没有点击也要响应房间变化，因此由 Effect 管理;
- 响应式区别: 事件读取触发它的快照，Effect 则随着其响应式依赖变化重新同步;

## Effect 中只有通知需要读取最新值时怎样处理？

- Effect Event: `useEffectEvent(callback)` 定义属于 Effect 的事件逻辑，调用时读到最新已提交渲染的 props/state，而不让这些读取导致重新同步;
- 拆分依据: 房间决定连接生命周期，主题只决定连接成功通知的外观，两种原因应分开;

```jsx
import { useEffect, useEffectEvent } from "react";

function Chat({ roomId, theme, connect, notify }) {
  const onConnected = useEffectEvent(() => {
    notify("已连接", theme);
  });
  useEffect(() => {
    const connection = connect(roomId);
    connection.on("connected", onConnected);
    connection.open();
    return () => connection.close();
  }, [roomId, connect]);
  return <p>{roomId}</p>;
}
```

## 怎样明确一次 Effect Event 的事件身份？

- 参数表达: 将触发这次事件的关键值作为参数传入，例如 visitedUrl，其他非响应式最新值在回调内部读取;
- 防止漏依赖: 不能把真正决定重连的 roomId 藏进 Effect Event，只为让依赖数组变短；先澄清同步原因再拆分;

## Effect Event 的调用边界是什么？

- 允许位置: 在同一组件的 useEffect、useLayoutEffect、useInsertionEffect 或其他 Effect Event 所建立的逻辑中调用;
- 禁止用途: 不在渲染或普通点击处理器中调用，不传给其他组件或 Hook，也不把它当作通用稳定回调;
- 引用契约: 返回函数的身份并不稳定，排除在依赖数组外；依赖检查器会帮助约束正确使用;
