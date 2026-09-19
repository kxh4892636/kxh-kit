---
id: e492d8d8-70b1-4135-96b2-b33966094b20
---

# JSON 与 XML

## JSON 的语法规则是什么？

```json
"Hello world!"
[25, "hi", true]
{
  "name": "Nicholas",
  "age": 29,
  "school": { "name": "Merrimack College" }
}
```

- 简单值: 字符串、数值、布尔值与 `null`;
- 字符串: 必须使用双引号;
- 对象: 属性名必须使用双引号, 同级属性不能重名, 除最后一个属性外必须有逗号;

## JSON 序列化与解析有哪些选项？

```js
JSON.stringify(value, replacer?, space?);
JSON.parse(text, reviver?);
```

- `replacer` 为数组: 只序列化数组列出的属性;
- `replacer` 为函数: 接收 `key` 与 `value`, 返回 `undefined` 表示忽略该属性;

```js
JSON.stringify(book, ["title", "edition"]); // 只保留指定属性
JSON.stringify(book, (key, value) => (key === "edition" ? undefined : value)); // 忽略 edition
```

- 缩进: 第三个参数控制缩进, 可以是空格数或替代字符串;

```js
JSON.stringify(book, null, 4); // 四个空格
JSON.stringify(book, null, "--"); // 用 -- 缩进
```

- `toJSON()`: 对象自定义序列化结果, 优先级高于普通序列化;

```js
const book = { title: "Professional JavaScript", toJSON: () => "custom" };
JSON.stringify(book); // "\"custom\""
```

- `reviver`: 解析时按 `key` 还原类型, 常用于把日期字符串恢复为 `Date`;

```js
const book = {
  title: "Professional JavaScript",
  releaseDate: new Date(2017, 11, 1),
};
const jsonText = JSON.stringify(book);
const bookCopy = JSON.parse(jsonText, (key, value) =>
  key === "releaseDate" ? new Date(value) : value,
);
bookCopy.releaseDate.getFullYear(); // 2017; 已还原为 Date
```

- 常用场景: `parse` 与 `stringify` 连用可做简单深拷贝, 限制见 [深浅拷贝](./120-深浅拷贝.md);

## XML 的文档结构是什么样的？

```xml
<?xml version="1.0" encoding="UTF-8"?>
<root xmlns:ns="http://example.com/ns">
  <element attribute="value">文本内容</element>
  <ns:element>带命名空间前缀的元素</ns:element>
  <self-closing />
  <data><![CDATA[不解析 < > 等特殊字符]]></data>
</root>
```

- 声明: `<?xml ... ?>` 中 `version` 必需, 可指定 `encoding`;
- 命名空间: 用 `xmlns:前缀` 声明后以 `前缀:元素名` 使用;
- CDATA: 其中的内容不被解析, 适合包含尖括号等特殊字符;
- 注释: `<!-- ... -->`;

## XML 如何与 DOM 互转？

| 方法                                          | 作用                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `new DOMParser().parseFromString(str, mime)`  | 把字符串解析为文档, MIME 可为 `application/xml`、`text/xml`、`image/svg+xml`、`text/html` |
| `new XMLSerializer().serializeToString(node)` | 把 DOM 节点序列化为 XML 字符串                                                            |

```js
const doc = new DOMParser().parseFromString("<a>1</a>", "application/xml");
doc.documentElement.textContent; // "1"

new XMLSerializer().serializeToString(doc); // "<a>1</a>"
```

- 错误处理: `application/xml` 语法不合法时不会抛异常, 会得到一个含 `parsererror` 元素的文档, 可用 `doc.querySelector("parsererror")` 判断;
- 用途: 两个 API 配合即可读写节点, 不必手写字符串拼接; 换成 `text/html` 就是宽容的 HTML 解析;
