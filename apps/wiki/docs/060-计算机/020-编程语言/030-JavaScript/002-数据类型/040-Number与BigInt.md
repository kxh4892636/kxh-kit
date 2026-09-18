---
id: 8f22bb60-501a-4b6d-824b-6102263bb75e
---

# Number 与 BigInt

## Number 用什么格式表示数值？

- 编码: IEEE-754 64 位双精度浮点数, 整数与浮点数共用;
- 字面量: 支持二进制 `0b10`、八进制 `0o70` 或 `070`、十六进制 `0xa`, 以及科学计数法 `3.125e7`;

```js
let intNum = 55;
let bNum = 0b10;
let octalNum = 0o70;
let hexNum = 0xa;
let floatNum = 3e-7;
```

## 浮点数会带来哪些精度问题？

- 隐式取整: 字面量 `1.0`、`10.0` 会按整数处理;
- 表示误差: 二进制无法精确表示部分十进制小数;

```js
0.1 + 0.2; // 0.30000000000000004
```

- 比较办法: 用 `Number.EPSILON` 作为容差, 或按业务把浮点换算成整数;
- 内存口径: 整数存于栈上, 浮点数存于堆上并由栈保存地址;

## Number 的边界常量与溢出行为是什么？

| 常量                       | 含义                 |
| -------------------------- | -------------------- |
| `Number.MAX_VALUE`         | 最大正有限值         |
| `Number.MIN_VALUE`         | 最小正有限值         |
| `Number.MAX_SAFE_INTEGER`  | 可安全表示的最大整数 |
| `Number.MIN_SAFE_INTEGER`  | 可安全表示的最小整数 |
| `Number.POSITIVE_INFINITY` | `Infinity`           |
| `Number.NEGATIVE_INFINITY` | `-Infinity`          |
| `Number.EPSILON`           | 最小可区分误差       |
| `Number.NaN`               | 非数值               |

- 溢出: 计算结果超出可表示范围时得到 `Infinity` 或 `-Infinity`;

## NaN 有什么特殊行为？

- 语义: 表示无效数值, 但 `typeof NaN === "number"`;
- 传播: 任何含 `NaN` 的算术运算结果都是 `NaN`;
- 自比较: `NaN` 与任何值 (包括自身) 相等判断均为 `false`, 只能用 `Number.isNaN()` 或 `isNaN()` 判断;

```js
const x = NaN;
x === NaN; // false
Number.isNaN(x); // true
```

## BigInt 解决什么问题？

- 语义: 任意精度的整数, 用于超过安全整数范围的场景;
- 字面量: 数值后加 `n`, 或用 `BigInt("...")` 转换;

```js
const bigint = 1234567890123456789012345678901234567890n;
const sameBigint = BigInt("1234567890123456789012345678901234567890");
```

## 如何格式化数字？

- `Intl.NumberFormat`: 按地区格式化, 千分位与小数位可控;
- `Number.prototype.toLocaleString`: 内部调用 `Intl.NumberFormat`;

```js
(1234567.8911111).toLocaleString("en-US"); // "1,234,567.891"
```
