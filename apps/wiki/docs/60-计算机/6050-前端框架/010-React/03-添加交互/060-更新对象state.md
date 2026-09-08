---
id: c2e7df7b-9564-4a9f-897c-7c1374b922f1
---

# 更新对象 state

## 什么是不可变更新, 直接修改对象会怎样?

- state 中的对象应视为只读;
- 直接修改不会触发正确的重新渲染;

```jsx
// 错误
person.name = "New";
setPerson(person);
```

## 如何用展开语法创建新对象?

- 用展开语法复制后修改;

```jsx
setPerson({
  ...person,
  name: "New",
});
```

## 嵌套对象如何逐层复制更新?

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

## 表单多个字段如何用一个 state 对象更新?

- 可以用一个 state 对象保存表单, 按字段名更新;

```jsx
function handleChange(e) {
  setForm({
    ...form,
    [e.target.name]: e.target.value,
  });
}
```

## 为什么 state 要保持不可变?

- React 通过引用比较判断变化;
- 便于撤销、调试和性能优化;
- 嵌套较深时可用 Immer 的 `produce` 以可变风格写不可变更新;
