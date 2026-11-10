---
id: 1a20cba2-8fb2-4635-8930-64580ad3c4c6
---

# JSX 中的 JavaScript

## 如何区分固定字符串与动态表达式？

- 字符串属性: `src="avatar.png"` 传入固定字符串, 引号内的变量名不会被求值;
- 动态属性: `src={user.imageUrl}` 里放 JavaScript 表达式;
- 写法: 花括号放等号后, 不要包在引号里;
- 子节点表达式: 在标签内容中使用 `{user.name}`, 把计算结果作为子节点;

```jsx
const user = { name: "Ada", imageUrl: "/ada.png" };

function Avatar() {
  return <img src={user.imageUrl} alt={"Portrait of " + user.name} />;
}
```

## 花括号内的哪些值可以直接显示？

- 可以用: 变量、函数调用、运算与三元表达式;
- 不能直接写: `if`、`for` 等语句;
- 可渲染: 字符串、数字、React 元素与可渲染节点数组;
- 不显示: 布尔值、`null` 与 `undefined`;
- 普通对象: 可以传给 props, 但不能直接作为显示内容;
- 做法: 取对象字段, 或先转成字符串;

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
- 内层花括号: 创建 JavaScript 对象字面量, 因此双花括号不是额外的 JSX 语法;
- 样式属性: 用 JavaScript 属性名, 例如 `backgroundColor`;
- 动态样式: 适合内联对象; 固定样式: 可放 CSS 文件;

```jsx
function Avatar({ size }) {
  return (
    <img src="/ada.png" alt="Ada" style={{ width: size, height: size, borderRadius: "50%" }} />
  );
}
```

## 如何让复杂表达式保持可读？

- 提取计算: 返回 JSX 前先算出有名字的变量, 让标记只表达结构;
- 前提: 计算仍要遵守渲染纯度规则;
- 拆分条件: 分支写法见[条件渲染](./040-条件渲染.md);
- 反例: 不要在花括号里堆多层难解释的逻辑;
