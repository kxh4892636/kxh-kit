---
id: 517e5f16-237e-467c-a5ea-d69706238130
---

# Date 与 RegExp

## Date 如何创建与解析时间？

- 表示: 毫秒级时间戳;
- 创建与解析:
  - `new Date()`: 当前时间;
  - `Date.parse(dateString)`: 字符串对应的毫秒时间戳;
  - `Date.UTC(year, month, day, ...)`: 按 UTC 组件得到时间戳;
  - `Date.now()`: 当前时间戳;

```js
const now = new Date();
```

- 读写: `getXXX`/`setXXX` 按本地时间或 UTC 读写各时间字段;
- 格式化: `toXXX()` 输出本地时区、本地语言或世界时字符串;
- 取值: `valueOf()` 与 `getTime()` 等价, 返回毫秒时间戳;

## 正则字面量支持哪些匹配标记？

```js
const expression = /pattern/afgls;
const expression2 = new RegExp(pattern, flags);
```

| 标记 | 含义                                |
| ---- | ----------------------------------- |
| `g`  | 全局匹配                            |
| `i`  | 忽略大小写                          |
| `m`  | 多行模式, `^`/`$` 匹配每行          |
| `y`  | 粘性匹配, 只从 `lastIndex` 之后开始 |
| `u`  | 按 Unicode 码点匹配                 |
| `s`  | `.` 匹配包括换行在内的任意字符      |
| `d`  | 结果包含匹配的起始与结束索引        |

## 正则实例暴露哪些属性？

```js
const pattern = /\[bc\]at/i;
pattern.global; // 是否设置 g
pattern.ignoreCase; // 是否设置 i
pattern.multiline; // 是否设置 m
pattern.sticky; // 是否设置 y
pattern.unicode; // 是否设置 u
pattern.dotAll; // 是否设置 s
pattern.hasIndices; // 是否设置 d
pattern.source; // 字面量字符串
pattern.flags; // 标记字符串
pattern.lastIndex; // 下一次搜索起点
```

## 正则有哪些匹配方法, /g 会带来什么影响？

- `exec(str)`: 返回匹配信息数组 (含 `index`、`input`、匹配分组), 无匹配返回 `null`;
- `test(str)`: 是否匹配, 返回布尔值;
- `RegExp.escape(str)`: 转义字符串, 得到可安全用于正则的文本;
- `/g` 影响: 每次 `exec` 从上次的 `lastIndex` 继续, 因此能逐个返回后续匹配;

```js
const text = "cat, bat, sat, fat";
const pattern = /.at/g;
pattern.exec(text).index; // 0
pattern.exec(text).index; // 5
```
