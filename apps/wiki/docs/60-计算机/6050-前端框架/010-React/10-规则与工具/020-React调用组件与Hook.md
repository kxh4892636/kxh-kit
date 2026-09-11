---
id: 97c38043-6cf5-4812-bf95-9ce5915e6f59
---

# React 调用组件与 Hook

## 为什么组件应写成 JSX 而不是直接调用？

- 声明式调用: `<Profile />` 把组件类型和输入交给 React，由 React 决定执行、调度与树中身份;
- 直接调用: `Profile()` 只是 JavaScript 调用，绕过独立组件边界，内部 Hook 可能错误地关联到调用者;
- 优化依据: 清晰组件边界让 React 管理局部 state、调试信息和跳过更新，不只影响写法外观;

```jsx
function Page() {
  return <Profile />;
}
```

## 为什么不应把 Hook 当作可替换依赖传递？

- 静态可读性: 组件内部应直接使用确定的 Hook，而不是通过 useData prop 等参数决定执行哪个 Hook;
- 动态风险: 调用者传入不同 Hook 可能改变内部 Hook 顺序和行为，使局部阅读无法判断是否正确;
- 替代方式: 将所需数据或业务参数传入确定的 Hook，或者提取明确的组件变体;

## 如何复用 Hook 行为而不动态包装 Hook？

- 组合方式: 在一个命名清晰的自定义 Hook 内直接调用其他 Hook，形成静态调用关系;
- 避免工厂: 不在渲染时通过高阶函数生成新 Hook，也不临时修改现有 Hook 的实现;
- 测试边界: 测试业务结果和外部依赖，不为了注入替身而让生产组件任意替换 Hook 本身;

```jsx
function useUserName(userId) {
  const user = useUser(userId);
  return user?.name ?? "访客";
}
```

## 普通函数、组件和 Hook 应如何分工？

- 普通函数: 承担纯计算或明确的非 Hook 操作，可以按普通 JavaScript 规则调用;
- 组件: 描述 UI，在 JSX 中由 React 调用;
- Hook: 为组件组合 React 能力，在组件或自定义 Hook 中按稳定规则调用;
