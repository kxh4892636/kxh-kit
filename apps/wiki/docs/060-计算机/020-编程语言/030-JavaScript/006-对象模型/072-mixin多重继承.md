---
id: db954029-8697-4c7d-a50e-a68a69205b40
---

# mixin 多重继承

## 为什么 JavaScript 需要 mixin？

- 限制: 一个对象只能有一个 `[[Prototype]]`, 一个类只能 `extends` 一个父类, 没有多继承;
- mixin: 只提供方法、不单独使用的对象, 把方法复制进别的类;
- 与继承的差别: 不占用唯一的父类名额, 也不改原型链, 只是在 `prototype` 上做方法拷贝;

```js
const sayHiMixin = {
  sayHi() {
    return `Hello ${this.name}`;
  },
  sayBye() {
    return `Bye ${this.name}`;
  },
};
class User {
  constructor(name) {
    this.name = name;
  }
}
Object.assign(User.prototype, sayHiMixin);
new User("Dude").sayHi(); // "Hello Dude"
```

- 与继承并用: `class User extends Person {}` 之后照样能 `Object.assign(User.prototype, mixin)`;
- 多继承: 依次 `Object.assign` 多个 mixin 即叠加多份行为; 风险是同类或 mixin 间同名覆盖, 命名要够独特;

## mixin 内部的 super 指向哪里？

- 机制: `super` 依赖方法创建时的 `[[HomeObject]]`, 即它当初写在哪个对象里;
- 复制不改 `[[HomeObject]]`: 方法被拷进新类后, `super` 仍在原 mixin 的原型上找, 不在宿主类上找;

```js
const sayMixin = {
  say(p) {
    return p;
  },
};
const sayHiMixin = {
  __proto__: sayMixin, // mixin 之间也能继承
  sayHi() {
    return super.say(`Hello ${this.name}`);
  },
};
Object.assign(User.prototype, sayHiMixin); // User 同上节
new User("Dude").sayHi(); // "Hello Dude"
```

## 如何用 mixin 给任意类加上事件能力？

- 目标: 让任何类/对象获得 `.on(name, handler)`、`.off(name, handler)`、`.trigger(name, ...data)`;
- 存储: 在 `this._eventHandlers` 上按事件名存处理函数数组;

```js
const eventMixin = {
  on(name, handler) {
    this._eventHandlers ??= {};
    (this._eventHandlers[name] ??= []).push(handler);
  },
  off(name, handler) {
    const list = this._eventHandlers?.[name];
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  },
  trigger(name, ...args) {
    this._eventHandlers?.[name]?.forEach((h) => h.apply(this, args));
  },
};

class Menu {
  choose(value) {
    this.trigger("select", value);
  }
}
Object.assign(Menu.prototype, eventMixin);
new Menu().on("select", (v) => console.log(`selected: ${v}`));
```

- 关键: `trigger` 用 `h.apply(this, args)` 转发上下文与数据, 见 [装饰器与调用转发](../005-函数/080-装饰器与调用转发.md);
- 价值: 同一 mixin 可挂到任意多个类上, 互不干扰, 也不打断各自的继承链;
