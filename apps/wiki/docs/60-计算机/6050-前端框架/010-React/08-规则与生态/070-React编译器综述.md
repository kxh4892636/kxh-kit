---
id: 9d4c0dd7-87e8-485e-abe4-eafdb9a80709
---

# React 编译器综述

React Compiler 的定位、安装、配置与调试。

## React 编译器的定位是什么?

- 构建期自动 memoization 工具: 自动 memoize 组件和值;
- 可减少手动 `useMemo`, `useCallback`, `React.memo`, 现有手动优化仍可保留;
- 前提: 代码遵循 Rules of React;

```js
// 编译前
const visible = useMemo(() => filter(items), [items]);

// 编译器可自动完成等价优化
```

## React 编译器如何安装? 支持哪些构建工具?

- 作为 devDependency 安装;
- 支持 Babel, Vite, Next.js, Webpack, Expo, Rspack 等;
- 推荐搭配 ESLint 插件检查 Rules of React;

```bash
npm install -D react-compiler
```

## React 编译器如何配置?

- 默认配置适合大多数应用;
- 高级选项: 编译控制、React 版本兼容、错误处理、调试、feature flags;

```js
// babel.config.js 示例
module.exports = {
  plugins: [["babel-plugin-react-compiler", { target: "19" }]],
};
```

## React 编译器如何增量采用? 有哪些指令?

- 目录级: Babel overrides 只对特定目录启用;
- 注解模式: `"use memo"` 强制/开启某函数编译, `"use no memo"` 排除;
- 运行时开关: gating 用 feature flag 控制编译结果是否生效;

```js
"use memo"; // 只编译该文件或组件
```

## 如何验证 React 编译器已生效?

- React DevTools 显示已编译组件标记;
- 检查构建产物中是否出现 memoization 代码;

## 如何调试? 常见破坏模式有哪些?

- 编译器错误: 构建期报告, 通常是代码违反规则;
- 运行时问题: 先临时禁用编译, 逐步定位;
- 常见破坏模式: 不纯渲染、修改 props/state、条件调用 Hook;

## 库作者如何预编译发布?

- 库作者可预编译发布, 减少消费者构建负担;
