---
id: 866c0854-346d-4685-ac6d-4cd2fa9b8431
---

# effect 同步外部系统与生命周期

## Effect 的用途是什么? 常见场景有哪些?

- 与 React 之外的系统同步: DOM、网络、非 React 组件、订阅;
- 在渲染后运行, 不阻塞渲染;
- 常见场景: 控制非 React 组件、订阅事件、触发动画、发送分析日志;

## 如何编写 Effect?

1. 声明 `useEffect(setup, deps)`;
2. 依赖列出 Effect 读取的响应式值;
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

## Effect 的同步周期是怎样的?

- Effect 只能做两件事: 开始同步, 停止同步;
- 依赖变化时: cleanup 旧同步 → setup 新同步; 组件卸载时: cleanup;
- cleanup 用于取消订阅、断开连接、清理定时器;
- 与组件 mount/update/unmount 不同, Effect 随依赖变化可多次启停;

## 应该从什么视角思考 Effect?

- 每个 Effect 描述“如何与当前值同步”;
- 不应把它想成“挂载后执行一次”, 而是“为每个依赖组合同步”;

## 响应式值有哪些? 依赖数组如何工作?

- 组件内声明的 props/state 都是响应式值;
- Effect 读取的响应式值都应列入依赖;
- 空数组 `[]` 表示 Effect 不依赖任何响应式值, 只在挂载时执行一次;
- 开发模式下 React 会额外 setup + cleanup 一次, 验证可重同步;

## 为什么要分离同步过程?

- 每个 Effect 应代表一个独立同步过程;
- 无关逻辑拆成多个 Effect, 避免互相牵连;
