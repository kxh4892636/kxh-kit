---
id: b9dc90cb-2653-4258-ac00-8d85a2e212d2
---

# Math 与 Global

## Math 提供哪些常量与常用方法？

- 常量: `Math.E`、`Math.PI`、`Math.LN2`、`Math.LN10`、`Math.LOG2E`、`Math.LOG10E`、`Math.SQRT1_2`、`Math.SQRT2`;

| 方法                                | 作用                            |
| ----------------------------------- | ------------------------------- |
| `min(...values)` / `max(...values)` | 最小 / 最大                     |
| `floor(x)` / `ceil(x)`              | 向下 / 向上取整                 |
| `trunc(x)`                          | 去掉小数部分, 比 `floor` 更直接 |
| `round(x)`                          | 四舍五入到最近整数              |
| `fround(x)`                         | 转为单精度浮点值                |
| `random()`                          | 返回 `[0, 1)` 的随机数          |
| `abs(x)`                            | 绝对值                          |
| `pow(base, exponent)`               | 幂运算                          |
| `sqrt(x)` / `cbrt(x)`               | 平方根 / 立方根                 |
| `hypot(...values)`                  | 各参数平方和的平方根, 避免溢出  |
| `exp(x)` / `log(x)`                 | 以 `e` 为底的指数 / 对数        |
| `log2(x)` / `log10(x)`              | 以 `2` / `10` 为底的对数        |
| `sign(x)`                           | 返回符号                        |
| `sin`/`cos`/`tan` 等                | 三角函数, 使用弧度              |

```js
// 取 [lowerValue, upperValue] 内的随机整数
const selectFrom = (lowerValue, upperValue) =>
  Math.floor(Math.random() * (upperValue - lowerValue + 1) + lowerValue);
```

## 全局对象是什么？

- 语义: 无法显式访问的对象, 所有可全局访问的变量与函数都是它的属性;
- 内容: `undefined`、`NaN`、`Infinity`, 各类构造函数 (`Object`、`Array`、`Function`、`Error` 等) 与全局函数;
- 浏览器代理: `window` 是全局对象在浏览器中的代理, 全局作用域的变量与函数会成为 `window` 的属性;

```js
// 非严格模式下, 未指定 this 的普通函数指向全局对象
const global = (function () {
  return this;
})();
```

## 全局函数有哪些类别？

- 数值: `isFinite(value)`、`isNaN(value)`、`parseFloat(string)`、`parseInt(string, radix?)`;
- 编码: `encodeURI(uri)`、`encodeURIComponent(uri)`、`decodeURI(uri)`、`decodeURIComponent(uri)`;
- 执行: `eval(string)` 把字符串当作代码执行, 具有调用位置的作用域;

```js
// encodeURIComponent 会转义更多字符, 如 : / ? # @ & = + $ %
encodeURIComponent("https://a.com/?q=1"); // "https%3A%2F%2Fa.com%2F%3Fq%3D1"
encodeURI("https://a.com/?q=1"); // "https://a.com/?q=1"
```

- `eval` 限制: 其中的变量与函数不会提升, 执行完毕后作用域即销毁; 非严格模式下其声明的函数可被外界调用;
- 实践: 避免使用 `eval`, 优先用 `JSON.parse` 等显式解析手段;
