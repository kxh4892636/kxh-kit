---
id: 645dc7d6-403d-4e8d-8fab-977086da4ad2
---

# Array 方法

## 变异方法会改变原数组吗？

- 变异方法: 直接修改原数组;

| 方法                              | 作用                                 |
| --------------------------------- | ------------------------------------ |
| `push(...items)`                  | 末尾添加, 返回新长度                 |
| `pop()`                           | 删除末尾元素并返回                   |
| `unshift(...items)`               | 开头添加, 返回新长度                 |
| `shift()`                         | 删除开头元素并返回                   |
| `splice(start, count, ...items)`  | 删除或替换或插入, 返回被删除元素数组 |
| `sort(compareFn?)`                | 原地排序, 返回数组本身               |
| `reverse()`                       | 原地反转, 返回数组本身               |
| `fill(value, start?, end?)`       | 用固定值填充区间                     |
| `copyWithin(target, start, end?)` | 浅复制区间到同数组另一位置           |

## 非变异方法返回什么？

| 方法                                | 作用                       |
| ----------------------------------- | -------------------------- |
| `slice(start?, end?)`               | 返回浅拷贝区间             |
| `concat(...items)`                  | 合并数组, 返回新数组       |
| `join(separator?)`                  | 连接为字符串               |
| `flat(depth?)`                      | 按深度摊平                 |
| `flatMap(fn, thisArg?)`             | 先映射再摊平一层           |
| `toReversed()`                      | 返回反转后的新数组         |
| `toSorted(compareFn?)`              | 返回排序后的新数组         |
| `toSpliced(start, count, ...items)` | 返回增删后的新数组         |
| `with(index, value)`                | 返回替换指定索引后的新数组 |

## 查找与判定有哪些方法？

| 方法                             | 返回                            |
| -------------------------------- | ------------------------------- |
| `includes(value, from?)`         | 是否包含, 按 SameValueZero 比较 |
| `indexOf(value, from?)`          | 首个匹配索引, 无则 `-1`         |
| `lastIndexOf(value, from?)`      | 末个匹配索引                    |
| `find(predicate, thisArg?)`      | 首个满足条件的元素              |
| `findIndex(predicate, thisArg?)` | 首个满足条件的索引              |
| `findLast` / `findLastIndex`     | 反向查找元素 / 索引             |
| `at(index)`                      | 按索引取值, 支持负数            |
| `some(predicate, thisArg?)`      | 是否存在满足条件的元素          |
| `every(predicate, thisArg?)`     | 是否所有元素都满足条件          |

## 遍历与聚合有哪些方法？

| 方法                                | 作用                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `forEach(fn, thisArg?)`             | 依次执行回调, 无返回值                                      |
| `map(fn, thisArg?)`                 | 映射为新数组                                                |
| `filter(predicate, thisArg?)`       | 过滤为新数组                                                |
| `reduce(fn, initialValue?)`         | 升序聚合为单值                                              |
| `reduceRight(fn, initialValue?)`    | 降序聚合为单值                                              |
| `entries()` / `keys()` / `values()` | 返回迭代器, 详见[迭代器](../008-迭代与生成器/010-迭代器.md) |

## 静态成员与派生构造是什么？

| 成员                                          | 作用                       |
| --------------------------------------------- | -------------------------- |
| `Array.from(iterable, mapFn?, thisArg?)`      | 从类数组或可迭代对象创建   |
| `Array.fromAsync(iterable, mapFn?, thisArg?)` | 异步版本                   |
| `Array.of(...elements)`                       | 按参数创建数组             |
| `Array.isArray(value)`                        | 判断是否为数组             |
| `Array[Symbol.species]`                       | 指定派生对象使用的构造函数 |

- 手写实现与常见坑见 [数组实践与手写](./060-数组实践与手写.md);
