---
id: 9d4c0dd7-87e8-485e-abe4-eafdb9a80709
---

# React 编译器综述

React Compiler 在参考文档中的定位、配置与生态。

## 定位

- 构建期自动 memoization 工具;
- 遵循 Rules of React 的代码可直接受益;

## 参考配置

- 默认配置适合大多数应用;
- 高级选项: 编译控制、React 版本兼容、错误处理、调试、feature flags;
- 支持 Babel 插件、Vite、Next.js、Webpack 等;

```js
// babel.config.js 示例
module.exports = {
  plugins: [["babel-plugin-react-compiler", { target: "19" }]],
};
```

## 指令

- `"use memo"`: 强制/开启某函数编译;
- `"use no memo"`: 排除某函数;

## 编译库

- 库作者可预编译发布;
- 减少消费者构建负担;

## 与手动优化关系

- 可减少 `useMemo`, `useCallback`, `React.memo`;
- 但现有手动优化仍可保留;
