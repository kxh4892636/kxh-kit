---
id: 715b3a20-a3e1-4459-b7f0-b7687e10ce5b
---

# Undefined 与 Null

## undefined 表示什么状态？

- 语义: 已声明但未初始化的值;
- 产生位置: 声明未赋值、函数无返回值、访问不存在的对象属性、未传的函数参数;
- 常见用途: 表示可选值缺失;

```js
let message;
console.log(message); // undefined
```

## null 表示什么状态？

- 语义: 已经定义, 但显式地指向空;
- 常见用途: 初始化一个将来要放对象的变量;
- 区别: `undefined` 是"还没有值", `null` 是"值就是空";

```js
let person = null; // 准备稍后放对象
```

## 两者如何比较与判断？

- 宽松相等: `null == undefined` 为 `true`, 且 `null` 只与 `undefined` 宽松相等;
- 严格相等: `null === undefined` 为 `false`;
- 一次性判断: `value == null` 同时命中两者;
- 布尔值: 两者都是假值, 详见 [Boolean](./030-Boolean.md);
