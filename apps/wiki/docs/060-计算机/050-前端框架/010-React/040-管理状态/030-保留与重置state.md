---
id: 4ff2b9f8-c120-4300-8811-e6ec2a45c06c
---

# 保留与重置 state

## React 根据什么判断状态是否属于同一个组件？

- 树中身份: state 关联到渲染树中的组件位置；同一父节点下的类型及 key 共同参与身份匹配;
- 源码位置: 两段不同分支的 JSX 若最终处在同一树位置且类型相同，仍可能保留状态，不能按 return 语句的位置判断;
- 移除子树: 组件真正从树中移除时，其状态会销毁，再次加入通常重新初始化;

## 如何用 key 表达不同业务身份？

- 主动重置: 用收件人 ID、记录 ID 等作为 key，让切换业务对象时重新创建表单及其后代状态;
- 局部范围: key 只在同一父节点下区分兄弟，并非整个应用的全局组件 ID;
- 列表场景: 为可重排条目选择 key 的规则见列表渲染，这里关注身份变化后的状态生命周期;

```jsx
function Messenger({ recipient }) {
  return <Chat key={recipient.id} recipient={recipient} />;
}
```

```jsx
function Draft({ recipient }) {
  const [text, setText] = useState("");
  return (
    <label>
      发给 {recipient.name}
      <input value={text} onChange={(event) => setText(event.target.value)} />
    </label>
  );
}

function Compose({ recipient }) {
  return <Draft key={recipient.id} recipient={recipient} />;
}
```

## 切换界面后需要保留草稿时怎样选择保存位置？

- 隐藏保留: 子树保持挂载并隐藏时可以保留局部状态，但大量隐藏 DOM 有成本；Activity 的行为见内置组件;
- 父层保存: 在稳定祖先按业务 ID 保存草稿，使子组件卸载后仍能恢复;
- 外部持久化: 跨刷新保留需要本地存储等外部方案，应明确序列化和恢复规则，不把组件 state 当作永久存储;
