---
id: 4ff2b9f8-c120-4300-8811-e6ec2a45c06c
---

# 保留与重置 state

## state 与组件在渲染树中的位置如何绑定?

- state 与组件在渲染树中的位置绑定;
- 同一位置同一组件类型, 保留 state;

## 同位置同类型渲染时 state 会保留吗?

```jsx
{
  isPlayerA ? <Counter /> : <Counter />;
} // 同一个位置, state 保留
```

## 同位置类型变化时 state 会重置吗?

```jsx
{
  isPlayerA ? <Counter /> : <PlayerB />;
} // 类型变化, state 重置
```

## 如何用 key 强制重置 state 或表单?

- 用 `key` 告诉 React 这是不同组件实例;
- 给组件不同 `key` 可在切换时重置其 state（如清空表单）;

```jsx
<Counter key={isPlayerA ? "a" : "b"} />
<Chat key={recipientId} />
```

## 组件位置变化如何影响 state? 列表为何要用稳定 key?

- 不要在 `if` 中移动组件到不同位置, 否则 state 会意外保留/重置;
- 列表项顺序变化时用稳定 key;

## 保留与重置 state 的实践原则有哪些?

- 需要“新实例”时使用 key;
- 需要保留 state 时保持位置和类型稳定;
