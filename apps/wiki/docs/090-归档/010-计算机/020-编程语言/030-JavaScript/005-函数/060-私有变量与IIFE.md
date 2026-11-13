---
id: af1e6032-00d4-4c4c-9ab3-cce1e094b203
---

# 私有变量与 IIFE

## IIFE 的语法与用途是什么？

- 语法: 用括号把函数表达式包起来并立即调用;

```js
(function () {
  // 私有作用域
})();
```

- 用途: 创建独立作用域, 避免污染外层;
- 模拟块级作用域: 在 `let`/`const` 之前, 用 IIFE 隔离 `var` 声明的变量;

```js
(function () {
  for (var i = 0; i < count; i++) console.log(i);
})();
console.log(i); // ReferenceError
```

## 私有变量与特权方法是什么？

- 私有变量: 定义在函数或块中、外部无法直接访问的变量与函数;
- 特权方法: 能访问私有变量的公有方法, 是访问私有状态的唯一出口;

## 特权方法有哪三种实现方式？

- 构造函数方案: 每个实例各持一份特权方法, 私有状态互不影响;

```js
function MyObject() {
  let privateVariable = 10;
  const privateFunction = () => false;
  this.publicMethod = function () {
    privateVariable++;
    return privateFunction();
  };
}
```

- 原型方案: 用匿名函数表达式包住构造函数, 私有变量被所有实例共享, 特权方法定义在原型上;

```js
(function () {
  let privateVariable = 10;
  function privateFunction() {
    return false;
  }
  MyObject = function () {}; // 不使用关键字, 绑定到全局上下文
  MyObject.prototype.publicMethod = function () {
    privateVariable++;
    return privateFunction();
  };
})();
```

- 模块模式方案: 基于单例对象返回特权与公有成员;

```js
const singleton = (function () {
  let privateVariable = 10;
  function privateFunction() {
    return false;
  }
  return {
    publicProperty: true,
    publicMethod() {
      privateVariable++;
      return privateFunction();
    },
  };
})();
```

- 取舍: 构造函数方案实例隔离但方法不复用; 原型方案方法复用但私有状态被实例共享;
