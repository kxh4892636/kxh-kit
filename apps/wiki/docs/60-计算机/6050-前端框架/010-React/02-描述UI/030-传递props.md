---
id: 7583cc61-4d31-4a63-adaa-9df53d422e72
---

# 传递 props

## props 如何形成组件的输入接口？

- Props: 父组件在 JSX 上提供的输入，子组件通过参数读取；可以传字符串、数字、对象、函数和 JSX 等 JavaScript 值;
- 解构: 在参数中按名称提取所需字段，让组件依赖一目了然;
- 渲染快照: 每次渲染收到一份当时的 props，父组件可在后续渲染传入新值，子组件不能直接改写已有 props;

```jsx
function Avatar({ person, size = 100 }) {
  return <img src={person.imageUrl} width={size} height={size} alt={person.name} />;
}

const profile = <Avatar person={{ name: "Ada", imageUrl: "/ada.png" }} />;
```

## 默认值在什么情况下生效？

- 触发条件: 解构默认值只在未传该 prop 或传入 undefined 时生效，null、0 和空字符串不会触发默认值;
- 接口含义: 默认值表达可省略输入的行为，不能代替校验所有不合法的数据;

| 调用                                          | size 的实际值                |
| --------------------------------------------- | ---------------------------- |
| `<Avatar person={person} />`                  | 100                          |
| `<Avatar person={person} size={undefined} />` | 100                          |
| `<Avatar person={person} size={0} />`         | 0                            |
| `<Avatar person={person} size={null} />`      | null，需要由接口决定是否允许 |

## 如何把一组 props 转交给内部组件？

- 展开传递: `<Avatar {...props} />` 适合包装组件透传输入，显式列出关键 props 则更容易看清依赖;
- 使用边界: 不要把展开当作每个组件的默认写法，过多透传往往说明组件边界或 children 组合方式需要调整;

```jsx
function Profile(props) {
  return <Avatar {...props} />;
}
```

## children 如何让容器组合任意内容？

- Children: 写在组件起止标签之间的 JSX 会成为 `children` prop，容器只决定外壳，不需要知道内部内容的具体类型;
- 组合价值: 布局、卡片和弹窗可以复用同一个容器，把内容的选择留给调用者;

```jsx
function Card({ children }) {
  return <section className="card">{children}</section>;
}

const view = (
  <Card>
    <p>可以替换的内容</p>
  </Card>
);
```
