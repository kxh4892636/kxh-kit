---
id: af758dc4-9455-41d2-9649-a8ebac3e0320
---

# React 编译器入门

React Compiler 做什么？如何安装？如何增量采用？如何调试？

## 作用

- build-time 工具: 自动 memoize 组件和值;
- 消除手动 `useMemo`, `useCallback`, `React.memo`;
- 前提: 代码遵循 Rules of React;

```js
// 编译前
const visible = useMemo(() => filter(items), [items]);

// 编译器可自动完成等价优化
```

## 安装

- 作为 devDependency 安装;
- 支持 Babel, Vite, Next.js, Webpack, Expo, Rspack 等;
- 推荐搭配 ESLint 插件检查 Rules of React;

```bash
npm install -D react-compiler
```

## 验证

- React DevTools 显示已编译组件标记;
- 检查构建产物中是否出现 memoization 代码;

## 增量采用

- 目录级: Babel overrides 只对特定目录启用;
- 注解模式: `"use memo"` 开启, `"use no memo"` 排除;
- 运行时开关: gating 用 feature flag 控制编译结果是否生效;

```js
// 只编译该文件/组件
"use memo";
```

## 调试

- 编译器错误: 构建期报告, 通常是代码违反规则;
- 运行时问题: 先临时禁用编译, 逐步定位;
- 常见破坏模式: 不纯渲染、修改 props/state、条件调用 Hook;
