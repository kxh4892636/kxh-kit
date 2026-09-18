---
id: 0fa00b17-f308-4848-9887-d90ae1d9a577
---

# Range

## Range 表示什么, 如何创建？

- 语义: 表示文档中的一个片段, 由起始与结束两个边界点定义;
- 创建: `document.createRange()`;
- 选择整块内容: `range.selectNode(node)` 选中整个节点, `range.selectNodeContents(node)` 选中节点的子内容;

```js
const range = document.createRange();
```

## 如何设置与读取边界？

| 成员                                              | 作用                      |
| ------------------------------------------------- | ------------------------- |
| `startContainer` / `endContainer`                 | 起始 / 结束节点           |
| `startOffset` / `endOffset`                       | 起始 / 结束偏移量         |
| `commonAncestorContainer`                         | 两端的公共祖先容器        |
| `setStart(node, offset)` / `setEnd(node, offset)` | 设置起始 / 结束位置       |
| `setStartBefore(node)` / `setStartAfter(node)`    | 把起点设在节点之前 / 之后 |
| `setEndBefore(node)` / `setEndAfter(node)`        | 把终点设在节点之前 / 之后 |

## Range 能对内容做哪些操作？

| 方法                          | 行为                                              |
| ----------------------------- | ------------------------------------------------- |
| `extractContents()`           | 从文档中取出范围内容, 返回 `DocumentFragment`     |
| `cloneContents()`             | 复制范围内容, 返回 `DocumentFragment`, 不影响文档 |
| `deleteContents()`            | 删除范围内容                                      |
| `insertNode(node)`            | 在范围起点插入节点                                |
| `surroundContents(newParent)` | 用新节点包裹范围内容                              |
