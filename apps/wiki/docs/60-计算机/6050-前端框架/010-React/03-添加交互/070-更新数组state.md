---
id: 73bae0ec-c0a0-4398-92c1-6d732606f42d
---

# 更新数组 state

## 更新数组 state 的原则是什么, 应避免哪些方法?

- state 中的数组视为只读;
- 使用返回新数组的方法, 避免 `push`, `pop`, `splice`, `sort`, `reverse`;

## 如何向数组 state 中添加元素?

- 末尾: `[...arr, newItem]`;
- 开头: `[newItem, ...arr]`;
- 指定位置: `slice` 拼接;

```jsx
setItems([...items, { id: nextId, name: "新项" }]);
```

## 如何从数组 state 中删除元素?

- 用 `filter` 生成新数组;

```jsx
setItems(items.filter((item) => item.id !== id));
```

## 如何转换数组 state 中的元素?

- 用 `map` 生成新数组;

```jsx
setItems(items.map((item) => (item.id === id ? { ...item, done: true } : item)));
```

## 如何插入与替换数组中的元素?

- 插入: `[...items.slice(0, index), item, ...items.slice(index)]`;
- 替换: `map` 按条件返回新对象;

## 对象数组如何保持不可变更新?

- 数组本身不可变, 内部对象也不可变;
- 更新某项时复制该对象;

## Immer 如何简化数组嵌套更新?

- 可用 `produce` 简化嵌套更新;

```js
setItems(
  produce(items, (draft) => {
    const item = draft.find((i) => i.id === id);
    item.done = true;
  }),
);
```
