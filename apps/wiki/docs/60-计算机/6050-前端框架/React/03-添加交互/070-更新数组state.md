---
id: 73bae0ec-c0a0-4398-92c1-6d732606f42d
---

# 更新数组 state

如何不可变地增删改数组？对象数组如何更新？

## 原则

- state 中的数组视为只读;
- 使用返回新数组的方法, 避免 `push`, `pop`, `splice`, `sort`, `reverse`;

## 添加

- 末尾: `[...arr, newItem]`;
- 开头: `[newItem, ...arr]`;
- 指定位置: `slice` 拼接;

```jsx
setItems([...items, { id: nextId, name: "新项" }]);
```

## 删除

- 用 `filter` 生成新数组;

```jsx
setItems(items.filter((item) => item.id !== id));
```

## 转换

- 用 `map` 生成新数组;

```jsx
setItems(items.map((item) => (item.id === id ? { ...item, done: true } : item)));
```

## 插入与替换

- 插入: `[...items.slice(0, index), item, ...items.slice(index)]`;
- 替换: `map` 按条件返回新对象;

## 对象数组

- 数组本身不可变, 内部对象也不可变;
- 更新某项时复制该对象;

## Immer

- 可用 `produce` 简化嵌套更新;

```js
setItems(
  produce(items, (draft) => {
    const item = draft.find((i) => i.id === id);
    item.done = true;
  }),
);
```
