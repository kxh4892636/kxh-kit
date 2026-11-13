---
id: 5bb2126b-b9d2-401e-9d00-250ece779590
---

# Unicode 与字符处理

## JavaScript 字符串怎样表示 Unicode？

- 基座: 字符串基于 Unicode, 每个字符用 1~4 字节的编码表示;
- 语义单元: 语言层面以 UTF-16 的 16 位 code unit 为基本单元;
- 结果: 常用字符占 1 个 code unit, 罕见字符占 2 个 (代理对);

## 为什么罕见字符的 `length` 是 2？

- 起因: JS 早期基于 UTF-16, 每字符只允许 2 字节; 2 字节只有 65536 种组合, 装不下整个 Unicode;
- 方案: 需要更多字节的字符用两个 2 字节单元拼成, 称为**代理对** (surrogate pair);
- 后果: 这类字符的 `length` 是 `2`;

```js
"𝒳".length; // 2, MATHEMATICAL SCRIPT CAPITAL X
"😂".length; // 2, FACE WITH TEARS OF JOY
"𩷶".length; // 2, 罕见汉字
```

- 索引陷阱: 按下标取到的是代理对的一半, 单独看没有意义;

```js
"𝒳"[0]; // 半个代理对, 显示为乱码
"𝒳"[1]; // 另一半
```

- 编码区间: 前半位于 `0xd800..0xdbff`, 后半位于 `0xdc00..0xdfff`, 这两段专供代理对使用;

## `codePointAt` 与 `String.fromCodePoint` 解决什么问题？

- 定位: 与 `charCodeAt`/`String.fromCharCode` 同名同形, 但能正确识别代理对;

```js
"𝒳".charCodeAt(0).toString(16); // d835, 只读第一半
"𝒳".codePointAt(0).toString(16); // 1d4b3, 合并两半
```

- 陷阱: 从第二半起读时, 两者都只给出后半, 无意义;

```js
"𝒳".charCodeAt(1).toString(16); // dcb3
"𝒳".codePointAt(1).toString(16); // dcb3
```

## 三种 `\u` 转义分别能表示什么？

| 写法           | 位数与范围               | 示例                |
| -------------- | ------------------------ | ------------------- |
| `\xXX`         | 2 位十六进制, `00`–`FF`  | `"\x7A"` 是 `z`     |
| `\uXXXX`       | 正好 4 位, `0000`–`FFFF` | `"\u044F"` 是 `я`   |
| `\u{X…XXXXXX}` | 1~6 位, `0`–`10FFFF`     | `"\u{1F60D}"` 是 😍 |

```js
"\x7A"; // z, 与 \u007A 相同
"\xA9"; // ©
"\u00A9"; // ©, 4 位写法
"\u2191"; // ↑
"\u{20331}"; // 佫, 罕见汉字
```

- 边界: `\xXX` 只能表达前 256 个字符;
- 超出 `U+FFFF`: 用 `\uXXXX` 表达时必须写成代理对;

## 为什么不能按任意位置切分字符串？

- 风险: 切片点可能落在代理对中间, 结果含半个代理对, 是"坏"字符串;

```js
"hi 😂".slice(0, 4); // hi <半个笑脸>, 乱码
```

- 对策: 切分/计数/索引都按 code point 或按迭代单位处理, 而不是裸下标;
- 迭代器按 code point 遍历字符串, 细节见 [迭代与生成器](../008-迭代与生成器/README.md);

## 组合字符与规范化是什么？

- 组合字符: 基础字符后面跟一个或多个"装饰"标记 (mark), 共同构成带变音符号的字符;

```js
"S\u0307"; // Ṡ, S + 上点
"S\u0307\u0323"; // Ṩ, 再加下点
```

- 问题: 视觉相同的字符串可能由不同的 Unicode 组合构成, 直接比较不相等;

```js
const s1 = "S\u0307\u0323"; // S + 上点 + 下点
const s2 = "S\u0323\u0307"; // S + 下点 + 上点
s1 === s2; // false, 看起来一样
```

- 解法: Unicode 规范化把字符串统一到标准形式, 由 `str.normalize()` 实现;

```js
"S\u0307\u0323".normalize() === "S\u0323\u0307".normalize(); // true
"S\u0307\u0323".normalize().length; // 1
"S\u0307\u0323".normalize() === "\u1e68"; // true, 合并成单码点
```

- 说明: 能否合并成单码点取决于该字符是否"足够常用"、是否被收入 Unicode 主表;
- 使用建议: 需要比较或存储用户输入的变音字符时先 `normalize()`;

## 大小写转换有什么陷阱？

- 逐字符映射: `toLowerCase()`/`toUpperCase()` 按码点映射, 不保证与 `length`、与互逆变换一致;

```js
"ß".toUpperCase().length; // 2, 变成 "SS"
"İ".toLowerCase().length; // 2, 变成 i + 组合点
```

- locale 差异: 需要土耳其语等本地化规则时用 `toLocaleLowerCase()`/`toLocaleUpperCase()`;
- 比较建议: 不要用大小写转换后比较字符串, 用 `localeCompare`, 见 [String](../002-数据类型/050-String.md);
