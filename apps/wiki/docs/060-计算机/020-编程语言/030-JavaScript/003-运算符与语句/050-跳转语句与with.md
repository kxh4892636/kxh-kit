---
id: c2421d8e-43a0-490e-a15a-28ea3106beac
---

# 跳转语句与 with

## 标签语句如何配合 break 与 continue 工作？

- 标签: 给语句命名, 供 `break`/`continue` 指向;
- `break`: 跳出最近的循环或 `switch`, 也可跳出指定标签;
- `continue`: `break` 的跳过版本, 结束本轮进入下一轮;

```js
let num = 0;
outermost: for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    if (i === 5 && j === 5) break outermost;
    num++;
  }
}
console.log(num); // 55
```

```js
let count = 0;
outermost: for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    if (i === 5 && j === 5) continue outermost;
    count++;
  }
}
console.log(count); // 95
```

## with 语句做了什么, 为什么不推荐？

- 作用: 简化对同一对象的重复访问;
- 机制: 把 with 对象对应的执行上下文临时移到作用域链最前端, 语句结束后移除;
- 限制: 严格模式禁止使用, 且不利于静态分析;

```js
with (location) {
  const qs = search.substring(1);
  const hostName = hostname;
}
```

- 等价写法: 先取出对象再访问其属性;

```js
const qs = location.search.substring(1);
const hostName = location.hostname;
```
