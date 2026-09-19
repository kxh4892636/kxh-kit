---
id: efbe9b60-a78b-4edc-a49f-115fb6083b0a
---

# FormData

## FormData 用来解决什么问题？

- 本质: 表示 HTML 表单数据的对象, 可直接作为网络请求的 `body`;
- 编码: 发送时被编码为 `Content-Type: multipart/form-data`;
- 效果: 服务端视角与用户手动提交表单完全一致, 且天然携带文件;
- 场景: 带 `<input type="file">` 的表单; 动态生成的 Blob 加上若干元数据字段一起提交;

## 如何创建 FormData？

```js
const fd = new FormData(); // 空对象, 纯手工装字段
const fd2 = new FormData(formElem); // 按 name 自动捕获表单字段
```

- 无参: 页面上不必存在表单, 字段全部由 `append` 提供;
- 传 `<form>`: 构造时一次性抓取其中所有成功控件 (含文件输入框);
- 提交: `fetch(url, { method: "POST", body: fd })`, 或 `xhr.send(fd)`, 见 [XMLHttpRequest 与上传](./070-XMLHttpRequest与上传.md);

## 字段如何增删改查与遍历？

| 方法                           | 作用                     |
| ------------------------------ | ------------------------ |
| `append(name, value)`          | 追加一个字段             |
| `append(name, blob, fileName)` | 追加一个文件字段         |
| `set(name, value)`             | 先删同名再追加, 保证唯一 |
| `delete(name)`                 | 按名删除                 |
| `get(name)`                    | 按名取值                 |
| `has(name)`                    | 是否存在该字段           |

- 唯一差异: `set` 会先移除所有同名字段, `append` 不会;
- 同名多值: 表单本就允许多个同名字段, 多次 `append` 会累积;
- 遍历: `for (const [name, value] of formData) {}` 按插入顺序迭代名值对;

```js
const fd = new FormData();
fd.append("key1", "value1");
fd.append("key1", "value2");
fd.set("key1", "only"); // 现在只剩一个 key1
for (const [name, value] of fd) console.log(`${name} = ${value}`);
```

## 如何发送文件或 Blob？

- 三参形式: `fd.append("image", imageBlob, "image.png")`;
  - 第 2 参: 数据本身 (`Blob`);
  - 第 3 参: **文件名**, 不是字段名; 效果等价于用户用 `<input type="file" name="image">` 提交了本地文件 `image.png`;
- 二参形式: 只适用字符串值, 送 Blob 会缺少文件名;
- Blob 的构造、`slice` 等成员见 [二进制数据与 Blob](../017-浏览器API/020-二进制数据与Blob.md);

```js
const imageBlob = await new Promise((r) => canvas.toBlob(r, "image/png"));
const fd = new FormData();
fd.append("firstName", "John");
fd.append("image", imageBlob, "image.png");
await fetch("/upload", { method: "POST", body: fd });
```

## `Content-Type` 该由谁决定？

- 自动: 浏览器按 body 类型设置; `FormData` 得到 `multipart/form-data; boundary=...`;
- boundary: 多部分体各字段之间的分隔标记, 由浏览器生成, 必须出现在头里服务端才能切分;
- 冲突: 手动写 `headers: { "Content-Type": "multipart/form-data" }` 会覆盖自动值并丢掉 boundary, 服务端解析失败;
- 结论: body 是 `FormData` 时不要手动设置 `Content-Type`;
- `fetch` 其余配置项见 [Fetch](./010-Fetch.md);

## FormData、普通对象、URLSearchParams 怎么选？

| 方案                  | body 形态  | 默认 Content-Type                   | 适用                   |
| --------------------- | ---------- | ----------------------------------- | ---------------------- |
| `FormData`            | 多部分编码 | `multipart/form-data`               | 文件上传、带文件的表单 |
| `URLSearchParams`     | `a=1&b=2`  | `application/x-www-form-urlencoded` | 纯文本键值对           |
| `JSON.stringify(obj)` | JSON 文本  | 无, 需手动设 `application/json`     | 嵌套结构化数据         |

- 服务端友好度: 多数服务端更擅长接收 multipart 表单, 而不是裸二进制;
- 版本号/元数据: 与图片同表提交时, 用 `FormData` 一并装字段即可, 不用拼两次请求;
