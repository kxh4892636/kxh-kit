---
id: 97e51062-f409-43d4-bba4-fdf9bacfe3ed
---

# location 与 URL

## location 对象保存哪些信息？

- 语义: 保存当前窗口文档的地址信息, `window.location` 与 `document.location` 指向同一对象;

| 属性                                  | 含义                       |
| ------------------------------------- | -------------------------- |
| `location.href`                       | 完整 URL, 可读写           |
| `location.protocol`                   | 协议 (含 `:`)              |
| `location.host` / `hostname` / `port` | 主机与端口 / 主机名 / 端口 |
| `location.origin`                     | 协议 + 主机名 + 端口       |
| `location.pathname`                   | 路径部分                   |
| `location.search`                     | 查询字符串 (含 `?`)        |
| `location.hash`                       | 片段标识 (含 `#`)          |
| `location.ancestorOrigins`            | 当前文档的所有祖先源       |

## 如何跳转与刷新页面？

| 方法                      | 行为                                 |
| ------------------------- | ------------------------------------ |
| `location.assign(url)`    | 加载新文档, 会在历史记录中新增条目   |
| `location.replace(url)`   | 用新文档替换当前文档, 不新增历史条目 |
| `location.reload(force?)` | 重新加载当前文档                     |
| `location.toString()`     | 返回 URL 字符串                      |

## URLSearchParams 如何解析查询字符串？

```js
const params = new URLSearchParams(location.search);
params.get("id"); // 读取第一个值
params.set("page", "2"); // 覆盖
params.toString(); // 序列化回查询字符串
```

| 方法/属性                                       | 作用                      |
| ----------------------------------------------- | ------------------------- |
| `append(name, value)`                           | 追加键值对                |
| `set(name, value)`                              | 设置键值, 覆盖该键其它值  |
| `get(name)` / `getAll(name)`                    | 读取第一个 / 全部值       |
| `has(name, value?)`                             | 是否存在该键 (或该键值对) |
| `delete(name, value?)`                          | 删除键或指定键值对        |
| `sort()`                                        | 按键名排序                |
| `size`                                          | 参数数量                  |
| `keys()` / `values()` / `entries()` / `forEach` | 遍历与迭代                |
