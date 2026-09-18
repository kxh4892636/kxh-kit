---
id: 9d4c0dd7-87e8-485e-abe4-eafdb9a80709
---

# React Compiler

## 编译器怎样减少手动缓存？

- 构建期分析: 在构建时分析组件与 Hook 的数据依赖，自动缓存可安全复用的计算、值与组件工作，减少手写 memo/useMemo/useCallback;
- 正确性前提: 依赖纯渲染和 React 规则，不保证把任意副作用或动态 Hook 改写成正确代码;
- 作用范围: 主要优化 React 组件与 Hook，不是跨应用的任意函数结果缓存，也不替代网络缓存;

## 如何将编译器接入构建链？

- 安装包: 安装 Babel 插件，并确保它在其他会改变源结构的 Babel 转换前执行，不能只安装包而不配置构建;
- 版本匹配: Vite、Next.js、Expo 等集成入口随工具版本不同，选择与当前构建工具一致的接法，不混用不同版本配置;

```bash
npm install -D babel-plugin-react-compiler@latest
```

```js
// babel.config.cjs
module.exports = {
  plugins: [["babel-plugin-react-compiler", { target: "19" }]],
};
```

## 如何逐步采用而不是一次改动整个应用？

- 目录增量: 在构建配置中先限制编译范围，验证一部分组件后逐步扩大;
- 函数增量: compilationMode='annotation' 配合函数体中的 'use memo' 明确加入，'use no memo' 临时排除问题函数;
- 运行时开关: gating 保留编译与原版本，通过稳定开关灰度选择，具体选项见编译器配置;

## 如何确认编译真正生效并定位回归？

- 验证证据: 检查构建产物中的编译结果、DevTools 标记与实际性能，成功安装不代表组件已经编译;
- 诊断路径: 先看跳过或报错原因，再最小化问题组件；临时排除用于定位，修复后重新启用;
- 行为验证: 特别检查曾依赖对象引用变化的 Effect、修改 props/state、渲染副作用等隐含假设;

## 库作者如何发布预编译组件？

- 发布产物: 发布已编译 JavaScript，让消费者不必再次配置编译器，明确支持的 React 版本与运行时依赖;
- 兼容验证: 编译 target 要覆盖承诺的 React 版本，在这些版本测试产物，不能只验证库源码开发环境;
- 产物边界: 不把开发插件作为运行时必需依赖，额外 runtime 是否需要由 target 决定;
