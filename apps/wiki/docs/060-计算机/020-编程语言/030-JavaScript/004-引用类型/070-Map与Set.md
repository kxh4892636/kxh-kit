---
id: 873c1b7b-b32d-4777-85b4-aad6983d72ec
---

# Map 与 Set

## Map 与普通对象有什么区别？

| 维度   | Map                             | Object                     |
| ------ | ------------------------------- | -------------------------- |
| 键类型 | 任意类型, 按 SameValueZero 比较 | 只能是字符串或 symbol      |
| 顺序   | 按插入顺序                      | 数字键升序, 其余按插入顺序 |
| 性能   | 频繁增删更合适                  | 频繁查找更合适             |
| 大小   | `size` 直接读取                 | 需要 `Object.keys` 计算    |
| 原型   | 无原型链干扰                    | 可能因原型链出现同名键     |

## Map 如何创建与操作？

```js
const m = new Map([
  ["key1", "val1"],
  ["key2", "val2"],
]);
```

| 方法/属性                            | 作用                                             |
| ------------------------------------ | ------------------------------------------------ |
| `set(key, value)`                    | 添加或更新, 返回 Map 本身                        |
| `get(key)`                           | 读取值                                           |
| `getOrInsert(key, value)`            | 键存在则返回旧值, 否则插入 `value` 并返回        |
| `getOrInsertComputed(key, producer)` | 键存在则返回旧值, 否则执行 `producer` 插入并返回 |
| `has(key)`                           | 是否存在该键                                     |
| `delete(key)`                        | 删除键, 返回是否成功                             |
| `clear()`                            | 清空                                             |
| `size`                               | 键值对数量                                       |
| `entries()`/`keys()`/`values()`      | 返回迭代器                                       |
| `forEach(fn, thisArg?)`              | 按插入顺序遍历                                   |
| `Map.groupBy(items, keySelector)`    | 按键分组, 返回 Map                               |

## Set 如何创建与操作？

```js
const s = new Set(["val1", "val2", "val3"]);
```

| 方法/属性                       | 作用                                    |
| ------------------------------- | --------------------------------------- |
| `add(value)`                    | 添加元素, 返回 Set 本身                 |
| `has(value)` / `delete(value)`  | 判断 / 删除                             |
| `clear()` / `size`              | 清空 / 元素数量                         |
| `values()`/`keys()`/`entries()` | 返回迭代器, `keys()` 是 `values()` 别名 |
| `forEach(fn, thisArg?)`         | 按插入顺序遍历                          |

- 唯一性: 按 SameValueZero 判等, `NaN` 与 `NaN` 视为同一值, `+0` 与 `-0` 视为同一值;

## Set 支持哪些集合运算？

| 方法                         | 结果       |
| ---------------------------- | ---------- |
| `union(other)`               | 并集       |
| `intersection(other)`        | 交集       |
| `difference(other)`          | 差集       |
| `symmetricDifference(other)` | 对称差集   |
| `isSubsetOf(other)`          | 是否为子集 |
| `isSupersetOf(other)`        | 是否为超集 |
| `isDisjointFrom(other)`      | 是否不相交 |

- 弱引用版本见 [WeakMap 与 WeakSet](./080-WeakMap与WeakSet.md);
