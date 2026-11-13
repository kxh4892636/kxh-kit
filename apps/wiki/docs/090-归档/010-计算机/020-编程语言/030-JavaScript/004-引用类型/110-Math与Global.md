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

## `globalThis` 与各环境的全局对象叫什么？

| 场景     | 名称                        |
| -------- | --------------------------- |
| 语言标准 | `globalThis`                |
| 浏览器   | `window`                    |
| Node.js  | `global`                    |
| 其他宿主 | 名称不定, 未必存在 `window` |

- 等价写法: `alert("Hi")` 与 `window.alert("Hi")` 意义相同, 全局对象的属性可直接访问;
- 跨环境: 不确定宿主环境时用 `globalThis`, 它是标准给出的统一名字, 主流浏览器已支持;

```js
globalThis.alert("Hi"); // 换环境也不用改写
```

## `var` 声明为什么成了全局对象属性？

- 会挂载: 非模块脚本中, 主代码流里的 `var` 变量与 `function` 声明会成为全局对象属性;
- 不会挂载: `let`/`const` 声明的顶层变量不会;
- 原因: 为兼容老脚本而保留的历史行为, 模块代码中不会发生;

```js
var gVar = 5;
window.gVar; // 5
let gLet = 5;
window.gLet; // undefined
```

## 为什么推荐显式写 `window.x`？

- 明确: `window.x` 直说"这是全局值", 不依赖 `var` 的挂载行为, 模块环境下行为一致;
- 抗遮蔽: 局部变量与全局同名时, 显式访问仍能拿到全局值;

```js
window.currentUser = { name: "John" };
window.currentUser.name; // 本地也有 currentUser 时照样取到全局值
```

- 建议: 全局变量越少越好; 函数以参数接收输入、以返回值给出结果, 更清晰也更易测试;

## 全局对象如何用于特性检测与 polyfill？

- 检测: 读全局对象上的属性, 判断当前环境是否支持某个特性;
- 补齐: 不支持时把自实现赋给该属性;

```js
if (!window.Promise) {
  window.Promise = MyPromiseImplementation; // polyfill
}
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
