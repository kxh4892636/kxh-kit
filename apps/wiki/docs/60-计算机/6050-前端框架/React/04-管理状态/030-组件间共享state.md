---
id: d853f23e-3fc6-4304-8c2e-e3d2bcf6aac2
---

# 组件间共享 state

如何提升 state 到共同父组件？受控与非受控组件是什么？

## 提升 state

- 多个子组件需要同步时, 把 state 移到共同父组件;
- 父组件通过 props 向下传值, 通过回调接收变更;

```jsx
function Accordion() {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <>
      <Panel isActive={activeIndex === 0} onShow={() => setActiveIndex(0)} />
      <Panel isActive={activeIndex === 1} onShow={() => setActiveIndex(1)} />
    </>
  );
}
```

## 单一数据源

- 每个 state 只在一个组件中“拥有”;
- 其他组件读取派生值;

## 受控组件

- 父组件通过 `value` 和 `onChange` 控制表单;
- 表单值由 React state 决定;

```jsx
<input value={text} onChange={(e) => setText(e.target.value)} />
```

## 非受控组件

- 表单值由 DOM 自身维护;
- 用 `ref` 或默认值读取;

## 选择

- 需要跨组件同步或校验时使用受控;
- 简单一次性输入可用非受控;
