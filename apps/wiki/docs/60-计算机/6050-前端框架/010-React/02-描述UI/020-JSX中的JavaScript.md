---
id: 1a20cba2-8fb2-4635-8930-64580ad3c4c6
---

# JSX 中的 JavaScript

## 如何区分固定字符串与动态表达式？

- 字符串属性: `src="avatar.png"` 传入固定字符串，引号内的变量名不会被求值;
- 动态属性: `src={user.imageUrl}` 计算 JavaScript 表达式；花括号放在等号后，不要包在引号里;
- 子节点表达式: 在标签内容中使用 `{user.name}`，把计算结果作为子节点;

```jsx
const user = { name: "Ada", imageUrl: "/ada.png" };

function Avatar() {
  return <img src={user.imageUrl} alt={"Portrait of " + user.name} />;
}
```

## 花括号内的哪些值可以直接显示？

- 表达式边界: 可以使用变量、函数调用、运算和三元表达式，不能直接写 `if`、`for` 等语句;
- 可渲染结果: 字符串、数字、React 元素以及可渲染节点数组可以成为子节点；布尔值、null 和 undefined 不显示内容;
- 对象限制: 普通对象可以传给 props，但不能直接作为显示内容；选择对象字段或先转换为字符串;

```jsx
const person = { name: "Lin", age: 20 };

// 显示字段，而不是 <p>{person}</p>
const profile = (
  <p>
    {person.name}，{person.age} 岁
  </p>
);
```

## 为什么 style 属性有两层花括号？

- 外层花括号: 从 JSX 进入 JavaScript 表达式;
- 内层花括号: 创建 JavaScript 对象字面量，因此双花括号不是额外的 JSX 语法;
- 样式属性: 使用 JavaScript 属性名，例如 `backgroundColor`；动态样式适合内联对象，固定样式也可放在 CSS 文件中;

```jsx
function Avatar({ size }) {
  return (
    <img src="/ada.png" alt="Ada" style={{ width: size, height: size, borderRadius: "50%" }} />
  );
}
```

## 如何让复杂表达式保持可读？

- 提取计算: 在返回 JSX 前计算有名字的变量，使标记集中表达结构；计算仍须遵守渲染纯度规则;
- 拆分条件: 条件分支的具体选择见[条件渲染](./040-条件渲染.md)，不要在花括号里堆积多层难以解释的逻辑;
