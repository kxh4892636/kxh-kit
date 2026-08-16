---
id: 82b2532e-f85f-469b-8ecb-6a43ed8809c6
---

# effect 生命周期

Effect 的生命周期与组件有何不同？为什么 Effect 会多次同步？

## 两种操作

- Effect 只能做两件事: 开始同步, 停止同步;
- 与组件 mount/update/unmount 不同, Effect 随依赖变化可多次启停;

## 同步周期

- 依赖变化时: cleanup 旧同步 → setup 新同步;
- 组件卸载时: cleanup;

```jsx
useEffect(() => {
  const conn = createConnection(roomId);
  conn.connect();
  return () => conn.disconnect(); // cleanup
}, [roomId]);
```

## 从 Effect 视角思考

- 每个 Effect 描述“如何与当前值同步”;
- 不应把它想成“挂载后执行一次”, 而是“为每个依赖组合同步”;

## 响应式值

- 组件内声明的 props/state 都是响应式值;
- Effect 读取的响应式值都应列入依赖;

## 空依赖

- `[]` 表示 Effect 不依赖任何响应式值;
- 但仍可能在 StrictMode 开发中额外执行一次以验证可重同步;

## 验证重同步

- React 开发模式故意 setup+cleanup 一次;
- 帮助发现缺失清理或无法重入的同步;

## 分离同步过程

- 每个 Effect 应代表一个独立同步过程;
- 无关逻辑拆成多个 Effect, 避免互相牵连;
