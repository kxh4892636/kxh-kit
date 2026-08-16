---
id: 7583cc61-4d31-4a63-adaa-9df53d422e72
---

# 传递 props

props 是什么？如何传参、设默认值、转发 props、传 children？

## props

- props: 父组件传给子组件的只读数据;
- 可传任意 JS 值: 字符串、对象、数组、函数、JSX;

```jsx
function Avatar({ person, size = 100 }) {
  return <img src={person.imageUrl} width={size} alt={person.name} />;
}

<Avatar person={user} size={80} />;
```

## 默认值

- 解构时给默认值: `{ size = 100 }`;
- 仅在 prop 为 `undefined` 时生效;

## 转发 props

- 展开语法: `<Child {...props} />`;
- 适合透传公共属性;

```jsx
function Profile({ person, ...rest }) {
  return <Avatar person={person} {...rest} />;
}
```

## children

- 嵌套 JSX 会作为 `children` prop 传入;
- 用于组合任意内容;

```jsx
function Card({ children }) {
  return <div className="card">{children}</div>;
}

<Card>
  <Avatar person={user} />
</Card>;
```

## props 随时间变化

- props 是渲染时的快照;
- 父组件重新渲染时, 子组件会收到新 props;
- 组件不应修改 props;
