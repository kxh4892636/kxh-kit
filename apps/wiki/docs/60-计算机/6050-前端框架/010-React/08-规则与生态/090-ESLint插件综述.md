---
id: e12607f0-ad18-4c3a-8e34-205542a48cd4
---

# ESLint 插件综述

eslint-plugin-react-hooks 的作用与推荐规则。

## 作用

- 在构建期强制执行 Rules of React;
- 捕获 Hooks 调用错误、不纯渲染、遗漏依赖等问题;

## 安装

```bash
npm install -D eslint eslint-plugin-react-hooks
```

## 推荐配置

- 使用官方 recommended 规则集;
- React Compiler 项目还会启用 compiler 相关规则;

```js
module.exports = {
  plugins: ["react-hooks"],
  extends: ["plugin:react-hooks/recommended"],
};
```

## 覆盖范围

- rules-of-hooks;
- exhaustive-deps;
- set-state-in-effect / set-state-in-render;
- refs、immutability、purity 等;

## 价值

- 提前发现并发/优化下的隐蔽 bug;
- 与 StrictMode 互补;
