---
id: c2e7df7b-9564-4a9f-897c-7c1374b922f1
---

# 更新对象 state

## 为什么修改对象字段不能代替更新状态？

- 旧对象: 存入 state 的对象属于先前快照;
- 直接赋值: 会同时篡改所有共享该引用的地方, 且不会请求渲染;
- 新对象: 创建下一对象交给 setter;
- 收益: React 得到新引用, 旧快照仍可用于调试与回退;
- 局部创建: 刚创建、尚未共享的新对象可以先修改, 再交给 setter;

```jsx
setPosition({ x: event.clientX, y: event.clientY });
```

## 如何只修改对象的一部分字段？

- 浅拷贝: `{ ...person, name: nextName }` 复制一层并覆盖 `name`;
- 边界: 展开不会递归复制嵌套对象;
- 覆盖顺序: 后面的同名字段覆盖前面, 通常先展开旧值再写变更;

```jsx
function handleChange(event) {
  const { name, value } = event.target;
  setPerson((previous) => ({ ...previous, [name]: value }));
}
```

## 如何更新嵌套对象而不修改旧引用？

- 复制路径: 从修改点向上复制每一级对象, 使从新根对象到修改点的路径都指向新引用;
- 引用模型: 看似嵌套的对象其实由引用连接;
- 后果: 同一个 `artwork` 可能被多处共享, 不能直接改;

```jsx
setPerson((previous) => ({
  ...previous,
  artwork: {
    ...previous.artwork,
    city: "上海",
  },
}));
```

## 深层更新过于繁琐时怎样调整？

- 扁平结构: 优先评估按 ID 索引的状态结构, 减少路径层数;
- Immer: 对 draft 可用修改式写法, 由库生成不可变结果;
- 澄清: draft 不是允许直接改原 state;
- 用法: 见生态中的 Immer 笔记;
- 取舍: 简单对象无需额外依赖, 复杂结构才需要比较复制成本与工具引入成本;
