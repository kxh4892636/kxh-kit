---
id: a15c4349-515e-4108-be7e-72b128e73aa1
---

# instanceof 与 Symbol.hasInstance

## instanceof 的判定流程是什么？

- 语法: `obj instanceof Class`, 结果把继承关系算在内;
- 第一步: 若存在静态方法 `Class[Symbol.hasInstance]`, 直接调它并以返回值作答, 不再看原型链;
- 第二步: 否则沿原型链逐跳比较 `obj.__proto__`、`obj.__proto__.__proto__` … 是否 `=== Class.prototype`;
- 终止: 任一跳相等返回 `true`, 走到 `null` 仍不等返回 `false`;
- 等价写法: `Class.prototype.isPrototypeOf(obj)`;
- 关键: 构造函数自身不参与判断, 只看 `Class.prototype` 与原型链, 机制见 [原型与原型链](./010-原型与原型链.md);

## instanceof 在继承与原型被改写时表现如何？

| 情形                           | 结果                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `Rabbit extends Animal` 的实例 | `rabbit instanceof Animal` 为 `true`, 第二跳命中                                 |
| 数组                           | `arr instanceof Array`、`arr instanceof Object` 均为 `true`                      |
| 原始值                         | 恒为 `false`, 判定口径见 [类型概览与判定](../002-数据类型/010-类型概览与判定.md) |

```js
function Rabbit() {}
const rabbit = new Rabbit();
Rabbit.prototype = {}; // 换掉原型对象
rabbit instanceof Rabbit; // false; 旧实例仍指向旧原型
```

- 启示: `instanceof` 依赖当前的 `prototype`, 改写原型会让旧实例「不再是」该类;

## 如何用 Symbol.hasInstance 自定义 instanceof？

- 用途: 按「能力/形状」而非继承关系判定, 实现鸭子类型;
- 代价: 一旦定义, 标准原型链逻辑被完全覆盖, 需自行覆盖所有情况;

```js
class Animal {
  static [Symbol.hasInstance](obj) {
    return Boolean(obj.canEat);
  }
}
({ canEat: true }) instanceof Animal; // true
```
