---
id: ed9fcc67-48d4-41b5-8844-2382b6d84557
---

# 区分事件与 Effect

## 如何根据原因选择事件处理器或 Effect？

- 特定交互: 发送消息源于用户点击发送, 放在事件处理器里;
- 边界: 只改房间或主题不该再发送;
- 持续同步: 聊天连接要随当前 `roomId` 保持一致;
- 特点: 没有点击也要响应房间变化, 所以交给 Effect;
- 响应式区别: 事件读取触发它的快照, Effect 则随着其响应式依赖变化重新同步;

## Effect 中需要读取最新值时怎样处理？

- Effect Event: `useEffectEvent(callback)` 定义属于 Effect 的事件逻辑;
- 读取: 调用时拿到最新已提交渲染的 props 与 state;
- 好处: 这些读取不会引起重新同步;
- 拆分依据: 房间决定连接生命周期, 主题只决定连接成功通知的外观, 两种原因应分开;

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

## 什么地方可以调用 Effect Event？

- 允许位置: 同一组件的 `useEffect`、`useLayoutEffect` 内部;
- 也允许: `useInsertionEffect` 内;
- 也允许: 其他 Effect Event 建立的逻辑中;
- 禁止用途: 不在渲染或普通点击处理器里调用;
- 也不: 传给其他组件或 Hook, 或当作通用稳定回调;
- 引用契约: 返回函数的身份并不稳定, 排除在依赖数组外; 依赖检查器会帮助约束正确使用;
