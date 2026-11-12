---
id: a4bd3484-a60b-4e45-874b-b530c924792b
---

# String

## String 为什么是不可变的字符序列？

- 编码: 以 16 位 code unit 为基本单元;
- 不可变: 字符串一旦创建, 内容不能原地修改, 所有"修改"方法都返回新字符串;
- 长度: `length` 返回 code unit 数量, 含双字节字符时与肉眼字符数不一致;

```js
"语言".length; // 2; 每个汉字 1 个 code unit
"😀".length; // 2; 代理对占 2 个 code unit
```

## code unit 与 code point 有什么区别？

- code unit: 16 位基本单元, 范围 `U+0000` 到 `U+FFFF`;
- code point: 一个字符的码点, 超出基本平面的字符由两个 code unit (代理对) 组成;
- 处理差异: `length`、`charAt`、`charCodeAt` 按 code unit 处理, `codePointAt`、`String.fromCodePoint` 按 code point 合并处理;

## 字符串字面量如何表达特殊字符？

| 转义 | 含义       | 转义     | 含义         |
| ---- | ---------- | -------- | ------------ |
| `\0` | 空字符     | `\'`     | 单引号       |
| `\b` | 退格       | `\"`     | 双引号       |
| `\n` | 换行       | `\\`     | 反斜杠       |
| `\f` | 换页       | `\xnn`   | 两位十六进制 |
| `\r` | 回车       | `\unnnn` | 四位十六进制 |
| `\t` | 水平制表符 |          |              |

## 模板字面量如何插值与自定义？

```js
const name = "kxh";
console.log(`My name is ${name}.`);
```

- 标签函数: 以模板为参数调用函数, 第一个参数是插值切分出的字符串片段数组 (长度为插值数 + 1), 其余参数依次是各插值;
- 原始字符串: `String.raw` 保留反斜杠, 不解释转义;

```js
function tag(strings, a, b, sum) {
  return `${strings.length}:${a},${b},${sum}`;
}
tag`${6} + ${9} = ${6 + 9}`; // "4:6,9,15"
String.raw`first line\nsecond line`; // "first line\\nsecond line"
```

## String 有哪些常用方法与静态成员？

| 类别     | 方法                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| 构造     | `String(value)`、`String.fromCharCode(...codes)`、`String.fromCodePoint(...codePoints)`                   |
| 索引     | `at(i)`、`charAt(i)`、`charCodeAt(i)`、`codePointAt(i)`                                                   |
| 查找     | `includes`、`startsWith`、`endsWith`、`indexOf`、`lastIndexOf`、`search`、`match`、`matchAll`             |
| 切片     | `slice(start, end)`、`substring(start, end)`、`split(sep, limit)`、`concat`                               |
| 变换     | `toLowerCase`、`toUpperCase`、`trim`、`trimStart`、`trimEnd`、`repeat`、`padStart`、`padEnd`、`normalize` |
| 替换     | `replace`、`replaceAll`                                                                                   |
| 比较校验 | `localeCompare(that)`、`isWellFormed()`                                                                   |
| 取值     | `toString()`、`valueOf()`                                                                                 |

- 与正则配合: `match`、`matchAll`、`search`、`replace` 支持正则参数, 详见 [RegExp](../004-引用类型/100-Date与RegExp.md);
