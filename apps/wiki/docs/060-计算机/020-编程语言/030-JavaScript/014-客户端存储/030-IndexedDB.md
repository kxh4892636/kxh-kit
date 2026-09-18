---
id: 18ffaef3-b810-4075-a1e4-6de116e813c6
---

# IndexedDB

## IndexedDB 与 Web Storage 有什么区别？

- 定位: 浏览器内的键值数据库, 支持索引与事务;
- 持久化: 除非用户或代码清除, 数据长期保留;
- 容量: 上限取决于硬盘剩余空间, 远超 Web Storage;
- 隔离: 同源可见;

## IndexedDB 的架构由哪些概念组成？

| 概念     | 作用                         |
| -------- | ---------------------------- |
| 数据库   | 一组对象存储的集合           |
| 事务     | 所有数据库操作都在事务中完成 |
| 对象存储 | 保存记录的容器, 类似表       |
| 游标     | 分次遍历查询结果             |
| 键范围   | 限制游标处理的范围           |
| 索引     | 按非主键字段高效读写         |

## 使用流程由哪些对象串起来？

1. 用 `indexedDB` 创建或打开数据库;
2. 通过 `IDBOpenDBRequest`/`IDBRequest` 监听成功与失败事件;
3. 用 `IDBDatabase` 创建事务与对象存储;
4. 用 `IDBTransaction` 建立对象存储上的读写上下文;
5. 用 `IDBObjectStore` 读写记录, 定义游标与索引;
6. 用 `IDBCursor` 遍历, 配合 `IDBKeyRange` 限定范围;
7. 用 `IDBIndex` 按索引读写;

```js
const request = indexedDB.open("app", 1);
request.onupgradeneeded = () => request.result.createObjectStore("users", { keyPath: "id" });
request.onsuccess = () => {
  const db = request.result;
  const tx = db.transaction("users", "readwrite");
  tx.objectStore("users").put({ id: 1, name: "kxh" });
};
```
