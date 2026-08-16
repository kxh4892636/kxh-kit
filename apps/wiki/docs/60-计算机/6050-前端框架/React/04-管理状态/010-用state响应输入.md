---
id: 234eeb81-0bc8-4b1e-b775-f2d65546019b
---

# 用 state 响应输入

声明式 UI 和命令式有何不同？如何设计状态机？

## 声明式 vs 命令式

- 命令式: 直接操作 DOM 开关、显示、禁用;
- 声明式: 描述不同视觉状态, 根据 state 渲染;

## 设计步骤

1. 识别组件所有视觉状态;
2. 确定触发状态变化的条件（输入、请求等）;
3. 用 `useState` 表示状态;
4. 删除非必要 state;
5. 连接事件处理器与 setState;

## 状态示例

```jsx
const [status, setStatus] = useState("typing"); // typing | submitting | success
```

## 减少状态

- 能由已有 state 计算的值不要额外存储;
- 能由 props 推导的值不要 mirror;
- 避免“不可能状态”的组合;

## 用 reducer 消除不可能状态

- 当状态转换复杂时, 用 reducer 集中管理;
- 每个 action 对应明确的状态迁移;

## 连接事件

```jsx
function handleSubmit() {
  setStatus("submitting");
  try {
    // ...
    setStatus("success");
  } catch {
    setStatus("typing");
  }
}
```
