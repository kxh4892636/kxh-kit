---
id: cb0c50a8-579b-4825-a376-9400e89a54ad
---

# this 绑定

## this 在全局与普通函数上下文中如何确定？

- 全局上下文: 严格模式为 `undefined`, 非严格模式为全局对象 (`window`/`global`);
- 普通函数: 由调用方式决定;
  - 被对象调用或用 `new` 调用: 指向该对象 (对象、构造函数或类实例);
  - 不以对象方法形式调用: 严格模式为 `undefined`, 非严格模式为全局对象;

```js
function test() {
  console.log(this);
}
const o = { test };
test(); // 非严格模式下为 window
o.test(); // o
```

- 机制: `this` 属于执行上下文中的 `[[ThisBinding]]`, 由调用点写入, 详见 [执行上下文与词法环境](../007-执行上下文与内存/020-执行上下文与词法环境.md);

## 箭头函数的 this 如何确定？

- 规则: 箭头函数创建的执行上下文没有自己的 this 绑定, 沿词法环境向外找到最近的 this 并使用;
- 结果: 箭头函数的 this 在定义时确定, 与调用方式无关;

```js
const o = {
  test0: () => console.log(this), // 最近的是全局上下文的 this
  test1: function () {
    (() => console.log(this))(); // 最近的是 test1 的 this, 即 o
  },
};
o.test0(); // 全局 this
o.test1(); // o
```

## 方法被赋值或借出后 this 指向什么？

```js
var name = "window";
const obj1 = {
  name: "obj1",
  intro1: function () {
    console.log(this.name);
    return () => console.log(this.name);
  },
  intro2: () => {
    console.log(this.name);
    return function () {
      console.log(this.name);
    };
  },
};
const obj2 = { name: "obj2" };

obj1.intro1.call(obj2)(); // obj2 obj2; 返回的箭头函数沿用 call 指定的 this
obj1.intro1().call(obj2); // obj1 obj1; 箭头函数忽略 call, 沿用定义时 this
obj1.intro2.call(obj2)(); // window window; 箭头函数与其中的普通函数都取全局 this
obj1.intro2().call(obj2); // window obj2; 普通函数被 call 重新绑定
```

- 结论: 判断 this 时先看函数是否为箭头函数 (`call`/`apply`/`bind` 无效), 再看调用点;

## 如何把 this 强制绑定到实例？

- `bind`: 返回一个新函数, this 永久绑定, 详见 [call、apply、bind](./070-call-apply-bind与手写实现.md);
- 类字段箭头函数: `arrow = () => {}` 在构造时确定 this, 但每个实例各持一份函数;
- 构造器绑定: 在 `constructor` 中 `this.method = this.method.bind(this)`, this 固定且方法在实例间共享, 详见 [class](../006-对象模型/040-class.md);
