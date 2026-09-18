---
id: fcba0c31-00b3-406e-8020-af4c23d62095
---

# Boolean

## Boolean 类型与数字是什么关系？

- 取值: 只有 `true` 与 `false`;
- 与数字不等价: `true !== 1`, `false !== 0`;
- 转换: `Number(true) === 1`, `Number(false) === 0`;

## 哪些值会被当成假值？

- 转换入口: `Boolean(value)` 或条件语句中的隐式转换;
- 假值集合: `false`、`""`、`0`、`NaN`、`null`、`undefined`;
- 其余值均为真值, 包括 `"0"`、`"false"`、`[]`、`{}`、`-0` 之外的非零数字;

| 数据类型  | 真值           | 假值        |
| --------- | -------------- | ----------- |
| Boolean   | `true`         | `false`     |
| String    | 任何非空字符串 | 空字符串    |
| Number    | 任何非 0 数字  | `0`、`NaN`  |
| Object    | 任意对象       | `null`      |
| Undefined | 无             | `undefined` |

## 显式创建 Boolean 对象会遇到什么问题？

- 机制: `new Boolean(false)` 得到的是对象, 对象恒为真值, 详见 [原始包装类型](./070-原始包装类型.md);
- 结论: 需要布尔值时使用 `Boolean(value)` 转换, 不要使用 `new Boolean()`;

```js
const falseObject = new Boolean(false);
console.log(falseObject && true); // true; 对象参与逻辑运算时为真
```
