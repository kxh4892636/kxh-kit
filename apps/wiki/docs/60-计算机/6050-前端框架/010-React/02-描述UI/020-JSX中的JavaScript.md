---
id: 1a20cba2-8fb2-4635-8930-64580ad3c4c6
---

# JSX 中的 JavaScript

## JSX 中字符串与引号如何使用?

- 属性传字符串: 用双引号 `"..."`;
- 传动态值: 用花括号 `{...}`;

```jsx
<img className="avatar" src={user.imageUrl} alt={"Photo of " + user.name} />
```

## 花括号里可以写哪些 JavaScript?

- 文本内容: `{user.name}`;
- 属性值: `src={user.imageUrl}`;
- 表达式: 函数调用、拼接、三元等;

## 双花括号的含义是什么?

- 在 JSX 中写对象字面量: `style={{ color: 'red' }}`;
- 外层 `{}` 是 JS 窗口, 内层 `{}` 是对象;

```jsx
<div style={{ width: user.imageSize, height: user.imageSize }} />
```

## 如何在 JSX 中引用对象与条件表达式?

- 可把数据提取为对象, 在 JSX 中引用;
- 可嵌入数组、条件表达式;

```jsx
const person = { name: "Hedy", theme: { color: "blue" } };
return <h1 style={person.theme}>{person.name}</h1>;
```

## JSX 表达式有哪些使用注意事项?

- JSX 不支持语句, 只支持表达式;
- 复杂逻辑建议先计算变量再放入 JSX;
