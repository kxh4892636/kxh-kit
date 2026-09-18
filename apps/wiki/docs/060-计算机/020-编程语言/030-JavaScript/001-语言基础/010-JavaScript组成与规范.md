---
id: 8abe9bb1-5d2b-4c1e-9954-59f8d488d5fb
---

# JavaScript 组成与规范

## JavaScript 由哪几部分组成？

- Core (ECMAScript): 语言核心, 定义语法、类型、语句、关键字、运算符与内置对象;
- Document Object Model (DOM): 把 HTML 文档表示为可编程的节点树;
- Browser Object Model (BOM): 浏览器窗口与宿主能力, 如 `window`、`location`、`navigator`;

## ECMAScript 与 JavaScript 是什么关系？

- ECMA-262: 语言规范, 定义 ECMAScript 的语义;
- ECMAScript: 规范所描述的语言, 与宿主平台无关;
- JavaScript: 宿主对 ECMAScript 的实现, 并额外提供 DOM、BOM 等宿主 API;
- 版本命名: ES6 即 ES2015, 之后按发布年份命名, 新特性按提案阶段 (Stage 0-4) 逐步进入规范;

## 从哪里查权威定义？

- MDN: [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference) 面向用法与浏览器兼容;
- ECMA-262: 规范原文, 用于确认边界行为;
