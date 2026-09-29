---
id: 73bae0ec-c0a0-4398-92c1-6d732606f42d
---

# 更新数组 state

## 如何为数组选择不会修改旧值的操作？

- 基本规则: 已有数组当作只读，使用返回新数组的方法，再把结果交给 setter;
- 名称陷阱: slice 复制区间，splice 会修改原数组，二者不能混用;

| 目的 | 避免直接用于旧数组 | 通常使用     |
| ---- | ------------------ | ------------ |
| 添加 | push、unshift      | 展开、concat |
| 删除 | pop、shift、splice | filter       |
| 替换 | 索引赋值           | map          |
| 排序 | sort、reverse      | 复制后再排序 |

## 如何添加、插入或删除数组条目？

- 添加: 用展开将新条目放到首部或尾部；插入时拼接前半段、新项和后半段;
- 删除: filter 保留不匹配目标 ID 的条目，不直接删除旧数组中的位置;

```jsx
setItems((previous) => [...previous, newItem]);
setItems((previous) => [...previous.slice(0, index), newItem, ...previous.slice(index)]);
setItems((previous) => previous.filter((item) => item.id !== removedId));
```

## 如何只替换匹配条目而保留其他元素？

- 映射更新: map 为目标条目返回新对象，为其他条目返回原对象，保留未变化部分的引用;
- 浅拷贝陷阱: `[...items]` 只复制数组，数组中的对象仍共享，随后修改 `next[0].done` 仍会篡改旧对象;

```jsx
setItems((previous) =>
  previous.map((item) => (item.id === changedId ? { ...item, done: true } : item)),
);
```

## 如何安全地排序或反转数组？

- 先复制: 对新数组调用 sort 或 reverse，不影响先前 state 中的数组顺序;
- 稳定身份: 重排时继续使用条目 ID 作为 key，让状态跟随数据项，key 规则见列表渲染;

```jsx
setItems((previous) => [...previous].sort((a, b) => a.rank - b.rank));
```
