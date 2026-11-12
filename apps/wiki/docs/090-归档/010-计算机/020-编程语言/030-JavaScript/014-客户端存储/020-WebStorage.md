---
id: 4239bfde-0cd2-4665-a5c5-5355b5f5b6a8
---

# Web Storage

## sessionStorage 与 localStorage 有什么区别？

- `sessionStorage`: 保存会话数据, 浏览器新建标签页得到新的存储, 同源标签页跳转可共享;
- `localStorage`: 持久化保存, 除非主动清除否则一直存在;
- 共性: 键值对结构, 同源可见;

## Storage 提供哪些方法？

| 成员                  | 作用                        |
| --------------------- | --------------------------- |
| `setItem(key, value)` | 存储数据                    |
| `getItem(key)`        | 读取数据, 不存在返回 `null` |
| `removeItem(key)`     | 删除指定键                  |
| `clear()`             | 清空全部                    |
| `key(index)`          | 按索引取键                  |
| `length`              | 键值对数量                  |

```js
localStorage.setItem("theme", "dark");
localStorage.getItem("theme"); // "dark"
```

## storage 事件如何通知其它文档？

- 触发: 同一源下其它文档修改存储时, 当前文档收到 `storage` 事件;
- 事件内容: `domain`、`key`、`newValue`、`oldValue`;

```js
window.addEventListener("storage", (event) => console.log(event.key, event.newValue));
```

## Web Storage 有哪些限制？

- 容量: 一般约 5MB;
- 类型: 只能存字符串, 非字符串在写入前会被隐式转换为字符串;
- 同步: 读写是同步操作, 大对象会阻塞主线程;
- 安全: 数据对同源脚本可见, 不适合存放敏感凭证;
