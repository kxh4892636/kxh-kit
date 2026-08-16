---
id: 662b4bd7-3a72-47c8-88a1-6b85b49a60b1
---

# 选择 state 结构

组织 state 的原则是什么？哪些 state 应该避免？

## 原则

- 避免冗余、重复、矛盾;
- 保持单一数据源;
- 尽量扁平化;

## 分组相关 state

- 一起变化的值可合并为一个对象;

```jsx
const [position, setPosition] = useState({ x: 0, y: 0 });
```

## 避免矛盾

- 多个 state 可能组合出不可能状态;
- 用枚举或 reducer 限制合法组合;

```jsx
// 避免 isSending 和 isSent 同时为 true
const [status, setStatus] = useState("idle");
```

## 避免冗余

- 能从 props 或已有 state 计算的值不要存;

```jsx
// 避免 fullName = firstName + lastName
```

## 避免镜像 props

- state 不应复制 props;
- 需要响应 prop 变化时, 在渲染期间调整或用 key 重置;

## 避免重复

- 同一数据在多处保存会导致同步 bug;
- 从单一来源派生;

## 避免深层嵌套

- 深层对象更新繁琐;
- 可扁平化为按 id 索引的结构;
