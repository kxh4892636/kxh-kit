---
id: 97c38043-6cf5-4812-bf95-9ce5915e6f59
---

# React 调用组件与 Hook

## 为什么组件应写成 JSX 而不是直接调用？

- 声明式调用: `<Profile />` 把组件类型和输入交给 React，由 React 决定执行、调度与树中身份;
- 直接调用: `Profile()` 只是 JavaScript 调用，绕过 React，内部 Hook 可能错误地关联到调用者;

```jsx
function Page() {
  return <Profile />;
}
```

## 为什么不应把 Hook 当作属性动态传入？

- 调用者传入不同 Hook 可能改变内部 Hook 顺序和行为，使组件行为不可预测;

## 如何复用 Hook 行为而不动态包装 Hook？

- 组合方式: 在一个命名清晰的自定义 Hook 内直接调用其他 Hook，形成静态调用关系;
- 避免工厂: 不在渲染时通过高阶函数生成新 Hook，也不临时修改现有 Hook 的实现;

```jsx
function useUserName(userId) {
  const user = useUser(userId);
  return user?.name ?? "访客";
}
```

## 普通函数、组件和 Hook 应如何分工？

- 普通函数: 承担纯计算或明确的非 Hook 操作，可以按普通 JavaScript 规则调用, 可以脱离 React 使用;
- 组件: 描述 UI，在 JSX 中由 React 调用;
- Hook: 为组件组合 React 能力，在组件或自定义 Hook 中按稳定规则调用;
