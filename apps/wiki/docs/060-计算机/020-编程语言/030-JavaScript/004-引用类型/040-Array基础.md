---
id: 227d51aa-45df-4e6c-844b-651c1bd31925
---

# Array 基础

## 数组在 JavaScript 中是什么？

- 语义: 动态大小、有序、可混合类型的列表;
- 本质: 特殊对象, 键为索引, 值为元素;
- 判定: `Array.isArray(value)` 判断是否为数组;

## 如何创建数组？

```js
new Array(20); // 单个数字参数表示 length, 元素初始化为 undefined
new Array(10, 20); // 多个参数表示数组元素
const colors = ["red", "blue", "green"]; // 数组字面量

Array.of(10, 20); // [10, 20]; 明确按元素创建
Array.from(arrayLike); // 从类数组或可迭代对象创建
```

- 空位: 字面量中连续的逗号会确定元素数量, 空位按 `undefined` 处理;

```js
Array.of(...[, , ,]); // [undefined, undefined, undefined]
```

## 什么是类数组对象, 如何转成数组？

- 类数组: 具有 `length` 属性的对象, 如函数内的 `arguments` 与部分 DOM 方法返回值;
- 限制: 不能直接调用数组方法;
- 转换: `Array.from(arrayLike)`、扩展运算符 `[...arrayLike]`, 或借用数组方法 `Array.prototype.slice.call(arrayLike)`;

```js
Array.prototype.forEach.call(arguments, (a) => console.log(a));
```

## 索引与 length 如何联动？

- 索引: 从 `0` 开始, 小于 `length` 时直接读写;
- 越界写入: 索引大于等于 `length` 时自动扩充数组, 中间位置填 `undefined`;
- 改写 `length`: 变小会截断多余元素, 变大则补齐 `undefined`;
- 上限: `length` 最大为 `2 ** 32 - 1`;
