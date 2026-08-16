---
id: 1ab87f1d-2c09-4288-8796-47d3fb94f352
---

# React 思维

如何从设计稿开始用 React 思考？组件层级如何拆分？state 放哪里？

## 思考流程

- 从 mockup 开始, 先拆组件, 再建静态版本, 再找 state, 最后加反向数据流;

## Step 1: 拆组件层级

- 依据单一职责: 每个组件只做一件事;
- 层级与设计稿嵌套结构对应;

## Step 2: 构建静态版本

- 先只传 props, 不引入 state;
- 自上而下或自下而上均可, 简单应用自上而下更直观;

## Step 3: 找最小完整 state

- 判断数据是否是 state: 是否随时间变化? 是否无法由已有 props/state 计算?
- 避免冗余和重复;
- props vs state: props 是父传子的参数, state 是组件内部可变记忆;

## Step 4: 确定 state 位置

- 找到所有需要该 state 的组件;
- 放在它们共同最近的父组件中;
- 若找不到合适父组件, 可创建新组件专门持有 state;

## Step 5: 添加反向数据流

- 子组件通过回调 props 通知父组件修改 state;
- 父组件把新值继续向下传, 形成单向数据流;

```jsx
function Parent() {
  const [query, setQuery] = useState("");
  return <SearchInput value={query} onChange={setQuery} />;
}

function SearchInput({ value, onChange }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} />;
}
```
