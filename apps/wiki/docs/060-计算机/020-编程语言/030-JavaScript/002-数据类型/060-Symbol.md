---
id: faf4a2e0-ad31-4488-80c8-3783ed6ea28e
---

# Symbol

## Symbol 解决什么问题？

- 语义: 唯一的、不可变的原始值, 常用作不会与字符串键冲突的属性键;
- 描述: `Symbol("test")` 中的字符串只是描述, 与符号标识无关;
- 唯一性: 每次调用 `Symbol()` 都得到不同的值;

```js
const s1 = Symbol();
const s2 = Symbol();
s1 === s2; // false
```

## 符号如何作为属性键？

- 计算属性语法: 在对象字面量中用 `[sym]` 定义键;
- 属性描述符: 用 `Object.defineProperty` / `Object.defineProperties` 定义;

```js
const s1 = Symbol("foo");
const o = { [s1]: "foo val" };

Object.defineProperty(o, s1, { value: "foo val" });
Object.defineProperties(o, { [s1]: { value: "foo val" } });
```

## 全局注册表如何使用？

- `Symbol.for(key)`: 在全局注册表中按键查找, 不存在则创建, 因此同键返回同一符号;
- `Symbol.keyFor(sym)`: 查询全局注册表中符号对应的键;

## 内置符号各自改变了什么行为？

| 内置符号                    | 作用                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `Symbol.iterator`           | 定义默认迭代器, 供 `for...of`、扩展运算符使用                                              |
| `Symbol.asyncIterator`      | 定义异步迭代器, 供 `for await...of` 使用                                                   |
| `Symbol.hasInstance`        | 自定义 `instanceof` 的判定                                                                 |
| `Symbol.isConcatSpreadable` | 控制 `Array.prototype.concat` 是否打平该对象的元素                                         |
| `Symbol.match`              | 自定义 `match`、`replace`、`search` 等方法的正则匹配行为                                   |
| `Symbol.toPrimitive`        | 自定义对象到原始值的转换, 详见 [隐式转换与判等](../003-运算符与语句/030-隐式转换与判等.md) |

```js
class Emitter {
  constructor(max) {
    this.max = max;
    this.idx = 0;
  }
  *[Symbol.iterator]() {
    while (this.idx < this.max) yield this.idx++;
  }
}
[...new Emitter(3)]; // [0, 1, 2]
```
