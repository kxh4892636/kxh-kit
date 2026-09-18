---
id: 53ef2e1c-06fd-43cb-bdbd-464c7e03972a
---

# call、apply、bind 与手写实现

## call、apply、bind 有什么区别？

| 方法                        | 调用时机   | 参数形式       | 返回值               |
| --------------------------- | ---------- | -------------- | -------------------- |
| `fn.call(thisArg, ...args)` | 立即调用   | 参数逐个传入   | 函数返回值           |
| `fn.apply(thisArg, args)`   | 立即调用   | 参数以数组传入 | 函数返回值           |
| `fn.bind(thisArg, ...args)` | 不立即调用 | 参数逐个传入   | 绑定 this 后的新函数 |

```js
function fun(age) {
  console.log(this.name, age);
}
const _this = { name: "kxh" };
fun.call(_this, 21); // kxh 21
fun.apply(_this, [21]); // kxh 21
const bound = fun.bind(_this, 21);
bound(); // kxh 21
```

- 注意: 箭头函数没有自己的 this, 三者都不能改变其 this, 见 [this 绑定](./030-this绑定.md);

## 如何手写 new？

- 步骤: 创建以构造函数 `prototype` 为原型的对象 → 以该对象为 this 执行构造函数 → 构造函数返回对象则用返回值, 否则用新对象;

```js
function myNew(fn, ...args) {
  const obj = Object.create(fn.prototype);
  const value = fn.apply(obj, args);
  return value instanceof Object ? value : obj;
}
```

## 如何手写 call 与 apply？

- 思路: 把函数临时挂到目标对象上, 通过 `context.fn(...)` 间接调用, 使 this 指向 `context`, 调用后删除临时属性;

```js
Function.prototype.myCall = function (context, ...args) {
  context = context || window;
  context.fn = this;
  const result = context.fn(...args);
  delete context.fn;
  return result;
};

Function.prototype.myApply = function (context, args) {
  context = context || window;
  context.fn = this;
  const result = context.fn(...args);
  delete context.fn;
  return result;
};
```

## 如何手写 bind？

```js
Function.prototype.myBind = function (context, ...boundArgs) {
  const fn = this;
  return (...args) => fn.apply(context, [...boundArgs, ...args]);
};
```

## Function 提供哪些常用成员？

| 成员                                     | 作用                                     |
| ---------------------------------------- | ---------------------------------------- |
| `Function(...args)`                      | 动态创建函数 (等价 `new Function`, 慎用) |
| `Function.prototype.call/apply/bind`     | 改变调用时的 this                        |
| `Function.prototype.toString()`          | 返回函数源码字符串                       |
| `Function.prototype.length` / `name`     | 形参数量 / 函数名                        |
| `Function.prototype.prototype`           | 用作原型继承的原型对象                   |
| `Function.prototype[Symbol.hasInstance]` | 自定义实例判断                           |
