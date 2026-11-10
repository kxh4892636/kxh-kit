---
id: 97c38043-6cf5-4812-bf95-9ce5915e6f59
---

# React 调用组件与 Hook

## 为什么组件应写成 JSX 而不是直接调用？

- 声明式调用: `<Profile />` 把组件类型与输入交给 React;
- 由 React 决定: 执行、调度与树中身份;
- 直接调用: `Profile()` 只是普通 JavaScript 调用, 绕过了 React;
- 后果: 内部 Hook 可能错误地关联到调用者;

```jsx
function Page() {
  return <Profile />;
}
```

## 为什么不应把 Hook 当作属性动态传入？

- 调用者传入不同 Hook 可能改变内部 Hook 顺序和行为, 使组件行为不可预测;

## 普通函数、组件和 Hook 应如何分工？

- 普通函数: 承担纯计算或明确的非 Hook 操作;
- 调用方式: 按普通 JavaScript 规则, 可脱离 React;
- 组件: 描述 UI, 在 JSX 中由 React 调用;
- Hook: 为组件组合 React 能力, 在组件或自定义 Hook 中按稳定规则调用;
