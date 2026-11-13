---
id: 854b4bc4-44ba-44f4-990e-c93b3a6560d5
---

# class

## class 如何声明与实例化？

```js
class Person {} // 声明
const Animal = class {}; // 表达式
```

- 实例化: 必须用 `new`, 否则抛错;
- `new` 的步骤: 创建对象 → 把对象 `[[Prototype]]` 指向 `constructor.prototype` → 把 `this` 指向该对象 → 执行 `constructor` → 返回该对象 (除非 `constructor` 返回对象);
- `constructor`: 可选, 缺省为空函数, 用于定义实例属性与方法;

## 实例成员、原型方法与静态方法有什么区别？

- 实例成员: 在 `constructor` 中用 `this` 定义, 各实例相互隔离;
- 原型方法: 定义在 `class.prototype` 上, 实例间共享;
- 静态方法: 用 `static` 定义, 挂在类本身, 无需实例即可调用;

```js
class Person {
  constructor() {
    this.locate = () => console.log("instance", this);
  }
  locate() {
    console.log("prototype", this);
  }
  static locate() {
    console.log("class", this);
  }
}
```

## 方法与访问器中的 this 如何处理？

- 普通方法: this 取决于调用点, 被借出后指向新调用者;
- 箭头函数字段: this 在创建时绑定到实例, 但每个实例各持一份函数;
- `bind`: 在 `constructor` 中绑定可让 this 固定且方法共享;

```js
class Test {
  color = "red";
  fun() {
    console.log(this.color);
  }
  arrow = () => {
    console.log(this.color);
  };
}
const instance = new Test();
const a = { color: "green", fun: instance.fun, arrow: instance.arrow };
instance.fun(); // red
instance.arrow(); // red
a.fun(); // green; 重新绑定
a.arrow(); // red; 保持定义时 this
```

- 访问器: 用 `get`/`set` 定义, 只定义 `get` 表示只读, 只定义 `set` 表示只写;

## 继承如何工作, super 有什么限制？

- 声明: `class Sub extends Super`, 子类继承父类的属性与方法;
- `super()`: 调用父类构造函数并把结果赋给子类 this, 必须在子类 `constructor` 中 `this` 之前调用;
- 缺省: 不写 `constructor` 时自动调用 `super(...args)`;
- `super` 限制: 只能出现在子类 `constructor` 与静态方法中;

```js
class Bus extends Vehicle {
  constructor() {
    super();
    console.log(this instanceof Vehicle); // true
  }
}
```

## 如何禁止实例化并要求子类实现方法？

- 抽象基类: 在 `constructor` 检查 `new.target === 基类` 时抛错;
- 强制实现: 检查实例上是否存在约定方法;

```js
class Vehicle {
  constructor() {
    if (new.target === Vehicle) throw new Error("Vehicle cannot be directly instantiated");
    if (!this.foo) throw new Error("Inheriting class must define foo()");
  }
}
```

## 如何模拟多类继承？

- mixin: 用接收父类并返回子类的函数叠加能力;
- 限制: 一个对象只有一个 `[[Prototype]]`, 一个类只能 `extends` 一个父类;
- 基础做法: 把方法对象合并进 `prototype`, 即下面的 `FooMixin`, 或 `Object.assign(User.prototype, mixin)`;

```js
const FooMixin = (Superclass) =>
  class extends Superclass {
    foo() {
      console.log("foo");
    }
  };
class Bus extends FooMixin(Vehicle) {}
```

- 完整机制: mixin 内 `super` 的 `[[HomeObject]]` 查找规则与 `eventMixin` 事件混入示例见 [mixin 多重继承](./072-mixin多重继承.md);

## class 的本质是什么？

- 类型: `typeof Person === "function"`, 类是一个特殊的函数;
- 原型: 具有 `prototype` 属性, 其原型对象的 `constructor` 指回类本身;
- 底层实现: 继承关系由寄生式组合继承实现, 见 [继承模式](./030-继承模式.md);
