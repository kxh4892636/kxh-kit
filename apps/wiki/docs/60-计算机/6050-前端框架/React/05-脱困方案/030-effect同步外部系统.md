---
id: 866c0854-346d-4685-ac6d-4cd2fa9b8431
---

# effect 同步外部系统

Effect 是什么？如何声明、指定依赖、清理？

## Effect 用途

- 与 React 之外的系统同步: DOM、网络、非 React 组件、订阅;
- 在渲染后运行, 不阻塞渲染;

## 与事件区别

- 事件: 响应用户特定交互;
- Effect: 当需要同步时自动运行/重跑;

## 如何写 Effect

1. 声明 `useEffect(setup, deps)`;
2. 指定依赖;
3. 需要时返回 cleanup;

```jsx
import { useEffect } from "react";

function Chat({ roomId }) {
  useEffect(() => {
    const conn = createConnection(roomId);
    conn.connect();
    return () => conn.disconnect();
  }, [roomId]);
  return <div>聊天室</div>;
}
```

## 依赖

- 依赖数组列出 Effect 读取的响应式值;
- 依赖变化时, React 先清理再重新执行;
- 空数组 `[]` 表示只在挂载时执行一次;

## 清理函数

- 用于取消订阅、断开连接、清理定时器;
- 开发模式 StrictMode 会额外执行一次以检测问题;

## 常见用途

- 控制非 React 组件;
- 订阅事件;
- 触发动画;
- 发送分析日志;

## 不要滥用

- 能用事件处理或派生值解决, 就不要用 Effect;
- 数据获取优先考虑框架或库;
