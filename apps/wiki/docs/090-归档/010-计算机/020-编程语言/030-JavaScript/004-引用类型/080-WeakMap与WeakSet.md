---
id: c4f05030-c08f-4243-af64-de4242577eac
---

# WeakMap 与 WeakSet

## 为什么 WeakMap 的键必须是对象？

- 约束: `WeakMap` 的键与 `WeakSet` 的值都必须是对象;
- 目的: 保证只能通过该对象访问对应值, 避免用临时字面量反复取回同一项;

```js
const wm = new WeakMap();
const key1 = { id: 1 };
wm.set(key1, "val1");
```

## 弱引用如何影响垃圾回收？

- 机制: 键是弱引用, 不阻止对象被回收;
- 差别: 普通 `Map` 持有强引用, 外部置空后条目仍在; `WeakMap` 中同一对象可被回收;

```js
let container = { id: 1 };
const wm = new WeakMap();
wm.set(container, "val");
container = null; // 对象可被回收, 条目随之消失

let strong = { id: 1 };
const m = new Map();
m.set(strong, "val");
strong = null; // Map 仍持有对象, 不会回收
```

## 为什么 WeakMap 与 WeakSet 没有遍历方法？

- 原因: 键值对可能在任意时刻被回收, 遍历结果不稳定, 迭代没有意义;
- 因此: 没有 `clear()`、`keys()`、`values()`、`entries()` 与 `size`, 也没有迭代器;
- 可用操作: `set`/`get`/`has`/`delete`(`WeakSet` 为 `add`/`has`/`delete`);

## 弱集合适合什么场景？

- 附加数据: 给外部对象挂载私有元数据而不污染对象本身;
- 缓存与标记: 以对象为键记录状态, 对象被回收时记录自动失效;
