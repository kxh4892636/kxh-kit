---
id: 9d4c0dd7-87e8-485e-abe4-eafdb9a80709
---

# React Compiler

## 编译器怎样减少手动缓存？

- 构建期分析: 分析组件与 Hook 的数据依赖;
- 自动缓存: 可安全复用的计算、值与组件工作;
- 收益: 减少手写 `memo`、`useMemo`、`useCallback`;
- 正确性前提: 依赖纯渲染与 React 规则;
- 不保证: 把任意副作用或动态 Hook 改写成正确代码;
- 作用范围: 主要优化 React 组件与 Hook;
- 不是: 跨应用的任意函数结果缓存, 也不替代网络缓存;

## 如何将编译器接入构建链？

- 安装: 加 Babel 插件, 且要在其他会改源结构的 Babel 转换之前执行;
- 反例: 只装包不配构建;
- 版本匹配: Vite、Next.js、Expo 的集成入口随版本不同;
- 要求: 接法与当前构建工具一致, 不混用不同版本配置;

```bash
npm install -D babel-plugin-react-compiler@latest
```

```js
// babel.config.cjs
module.exports = {
  plugins: [["babel-plugin-react-compiler", { target: "19" }]],
};
```

## 如何决定哪些函数进入编译？

- Infer: 默认按 React 命名与使用模式识别组件和 Hook, 适合常规项目;
- Annotation: 只编译函数体开头带 'use memo' 的函数, 适合逐步启用;
- Syntax: 面向 Flow 的 component/hook 语法;
- 边界: 不适用于普通 TypeScript 代码;
- All: 编译所有顶层函数;
- 代价: 普通工具函数会有不必要成本, 不作常规默认;

## 函数指令如何控制单个函数？

- 'use memo': 在函数体开头请求编译;
- 前提: 该函数仍要满足可分析与正确性要求, 它不会忽略错误;
- 'use no memo': 跳过该函数编译, 用于定位问题或划清边界;
- 反例: 不要在整文件里随手用它;
- 指令位置: 指令是函数开头的字符串语句, 与 RSC 文件级指令解决不同问题;

```jsx
function Result({ items }) {
  "use memo";
  return <p>{items.length}</p>;
}
```

```jsx
function ProblematicWidget({ model }) {
  "use no memo";
  return <ExternalWidget model={model} />;
}
```

- 排除记录: 为暂时跳过的函数记录具体问题与恢复条件, 避免诊断完成后仍长期丢失优化范围;

## 如何通过运行时开关灰度使用编译结果？

- Gating: 指定 source 模块与 `importSpecifierName`;
- 做法: 同时编译原始与编译版本, 用 `importSpecifierName` 开关控制;

```js
const compilerOptions = {
  gating: { source: "./flags", importSpecifierName: "isCompilerEnabled" },
};
```
