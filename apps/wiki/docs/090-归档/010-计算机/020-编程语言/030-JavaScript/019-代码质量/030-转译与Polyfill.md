---
id: a028cc86-78b9-4990-b472-f48ce6884e9b
---

# 转译与 Polyfill

## 为什么新特性不能直接用？

- 语言在进化: 新提案经 TC39 分析后进入 ECMA-262 规范, 版本按年份推进;
- 引擎不同步: 各引擎团队有各自的实现优先级, 常出现 "只实现了标准的一部分", 已入规范的特性也可能被推迟;
- 现实: 想用最新的语法与内置函数, 但用户的旧引擎不认;
- 查兼容性: [compat-table](https://compat-table.github.io/compat-table/es6/) 看纯语言特性, [caniuse](https://caniuse.com/) 看浏览器相关能力;
- 规范与版本关系见 [JavaScript 组成与规范](../001-语言基础/010-JavaScript组成与规范.md);

## 转译器解决什么问题？

- 定义: transpiler 是源码到源码的编译器, 解析现代代码后用旧语法重写, 让老引擎也能跑;
- 例子: 2020 年前没有 `??`, 转译会把 `height ?? 100` 改写成显式判空的三元表达式;

```js
// 转译前
height = height ?? 100;

// 转译后
height = height !== undefined && height !== null ? height : 100;
```

- 只做语法层面的等价改写, 不改变运行时行为;
- 时机: 开发时在自己机器上转译, 再把产物部署到服务器;
- 代表: Babel; webpack 这类构建系统可挂插件在每次改动时自动转译;

## Polyfill 解决什么问题？

- 场景: 新特性也可能是内置函数, 如 `Math.trunc(1.23)` 取整数部分, 老引擎根本没有这个函数;
- 做法: 没有语法变化就不需要转译, 只需把缺失的函数声明出来;
- 名字: 这种 "补齐缺口" 的脚本叫 polyfill;
- 可行性: JavaScript 很动态, 脚本可以给内置对象新增或修改函数;

```js
if (!Math.trunc) {
  Math.trunc = function (number) {
    return number < 0 ? Math.ceil(number) : Math.floor(number);
  };
}
```

- 代表库: [core-js](https://github.com/zloirock/core-js), 覆盖广且可按需只引入需要的部分;

## 两者各自负责什么，如何配合？

| 缺失的内容      | 手段     | 说明                                     |
| --------------- | -------- | ---------------------------------------- |
| 新语法/运算符   | 转译器   | 改写成等价的旧语法, 如 `??`、可选链      |
| 新内置函数/对象 | polyfill | 直接补上实现, 如 `Math.trunc`、`Promise` |
| 浏览器专有 API  | polyfill | 通过 caniuse 确认后再补                  |

- 组合: 现代项目典型配置是 webpack + babel-loader, 同时接入 core-js;
- 结论: 放心使用前沿特性, 但记得配好转译器与 polyfill 来保证旧环境可用;
