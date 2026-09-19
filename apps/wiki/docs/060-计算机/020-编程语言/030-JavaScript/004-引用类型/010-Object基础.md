---
id: db839b83-8920-4279-9918-264e0ae05a56
---

# Object 基础

## 如何创建对象与定义属性？

```js
const person = {}; // 对象字面量
const person2 = new Object(); // 构造函数
const person3 = Object.create(person); // 指定原型创建, 详见[原型与原型链](../006-对象模型/010-原型与原型链.md)

person.name = "Nicholas"; // 点语法
people["name"] = "Nicholas"; // 方括号语法
```

## 属性名会经历什么转换？

- 数字: 转为字符串;

```js
const people = {};
people[5] = true;
console.log(people); // { '5': true }
```

- 字符串与标识符: 等价, `people.name` 与 `people["name"]` 访问同一属性;

## 字面量简写与可计算属性如何写？

```js
const name = "Matt";
const person = {
  name, // 属性值简写
  [`job${1}`]: "developer", // 可计算属性
  sayName() {
    // 方法名简写
    console.log(this.name);
  },
};
```

## 解构如何取值？

- 语法: 左侧写与对象同形的模式, `const { name, job } = person`, 缺失属性得到 `undefined`;

## 属性枚举顺序如何确定？

- 无明确顺序: `for...in`、`Object.keys()` 的枚举顺序未在规范中固定, 不同 `[[OwnPropertyKeys]]` 实现可能不同;
- 有明确顺序: `Object.getOwnPropertyNames()`、`Object.getOwnPropertySymbols`、`Object.assign()` 等按规则枚举;
- 规则: 先按数字属性升序, 再按字符串与 symbol 的插入顺序;
