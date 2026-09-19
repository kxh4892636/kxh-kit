---
id: 0d83b53e-dcc2-4447-82ce-4e28d4eeec97
---

# Object 静态 API

## 创建与转换对象有哪些方法？

| 方法                                 | 作用                                         |
| ------------------------------------ | -------------------------------------------- |
| `Object(value)`                      | 把值包装为对象                               |
| `Object.create(proto, descriptors?)` | 以指定原型创建对象, 可同时定义属性描述符     |
| `Object.fromEntries(entries)`        | 把键值对列表转成对象                         |
| `Object.assign(target, ...sources)`  | 把可枚举自有属性复制到目标对象, 返回目标对象 |
| `Object.groupBy(items, keySelector)` | 按选择函数分组, 返回普通对象                 |

## 定义与读取属性描述符有哪些方法？

| 方法                                           | 作用                             |
| ---------------------------------------------- | -------------------------------- |
| `Object.defineProperty(obj, prop, descriptor)` | 定义或修改单个属性               |
| `Object.defineProperties(obj, descriptors)`    | 批量定义或修改属性               |
| `Object.getOwnPropertyDescriptor(obj, prop)`   | 读取单个自有属性的描述符         |
| `Object.getOwnPropertyDescriptors(obj)`        | 读取全部自有属性的描述符         |
| `Object.getOwnPropertyNames(obj)`              | 返回自有字符串属性名, 含不可枚举 |
| `Object.getOwnPropertySymbols(obj)`            | 返回自有 symbol 属性             |

## 原型与可扩展性判断有哪些方法？

| 方法                                | 作用             |
| ----------------------------------- | ---------------- |
| `Object.getPrototypeOf(obj)`        | 返回对象的原型   |
| `Object.setPrototypeOf(obj, proto)` | 设置对象的原型   |
| `Object.isExtensible(obj)`          | 是否可添加新属性 |
| `Object.isSealed(obj)`              | 是否已密封       |
| `Object.isFrozen(obj)`              | 是否已冻结       |
| `Object.preventExtensions(obj)`     | 阻止扩展         |
| `Object.seal(obj)`                  | 密封, 禁止增删   |
| `Object.freeze(obj)`                | 冻结, 禁止增删改 |

## 枚举与判等有哪些方法？

| 方法                       | 作用                                                 |
| -------------------------- | ---------------------------------------------------- |
| `Object.keys(obj)`         | 返回可枚举字符串属性名数组                           |
| `Object.values(obj)`       | 返回可枚举属性值数组                                 |
| `Object.entries(obj)`      | 返回可枚举键值对数组                                 |
| `Object.hasOwn(obj, prop)` | 是否为自有属性, 替代 `hasOwnProperty`                |
| `Object.is(a, b)`          | 判断两个值是否相同, 与 `===` 在 `NaN` 与 `-0` 上不同 |
