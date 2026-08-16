---
id: 4ff2b9f8-c120-4300-8811-e6ec2a45c06c
---

# 保留与重置 state

React 如何决定 state 保留或重置？如何强制重置？

## state 绑定位置

- state 与组件在渲染树中的位置绑定;
- 同一位置同一组件类型, 保留 state;

## 同位置同类型保留

```jsx
{
  isPlayerA ? <Counter /> : <Counter />;
} // 同一个位置, state 保留
```

## 不同类型重置

```jsx
{
  isPlayerA ? <Counter /> : <PlayerB />;
} // 类型变化, state 重置
```

## 强制重置

- 用 `key` 告诉 React 这是不同组件实例;

```jsx
<Counter key={isPlayerA ? "a" : "b"} />
```

## 表单重置

- 给表单不同 `key` 可在切换时清空;

```jsx
<Chat key={recipientId} />
```

## 位置影响

- 不要在 `if` 中移动组件到不同位置, 否则 state 会意外保留/重置;
- 列表项顺序变化时用稳定 key;

## 实践

- 需要“新实例”时使用 key;
- 需要保留 state 时保持位置和类型稳定;
