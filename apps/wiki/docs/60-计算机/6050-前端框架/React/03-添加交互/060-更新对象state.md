---
id: c2e7df7b-9564-4a9f-897c-7c1374b922f1
---

# 更新对象 state

为什么不能直接修改 state 中的对象？如何用展开语法和 Immer 更新？

## 不可变更新

- state 中的对象应视为只读;
- 直接修改不会触发正确的重新渲染;

```jsx
// 错误
person.name = "New";
setPerson(person);
```

## 创建新对象

- 用展开语法复制后修改;

```jsx
setPerson({
  ...person,
  name: "New",
});
```

## 嵌套对象

- 每层需要创建新对象, 否则内部引用未变;

```jsx
setCustomer({
  ...customer,
  address: {
    ...customer.address,
    city: "北京",
  },
});
```

## 多个字段

- 可以用一个 state 对象保存表单, 按字段名更新;

```jsx
function handleChange(e) {
  setForm({
    ...form,
    [e.target.name]: e.target.value,
  });
}
```

## Immer

- 用 `immer` 的 `produce` 写可变风格但产生不可变更新;

```js
import { produce } from "immer";

setPerson(
  produce(person, (draft) => {
    draft.name = "New";
  }),
);
```

## 为什么不可变

- React 通过引用比较判断变化;
- 便于撤销、调试和性能优化;
