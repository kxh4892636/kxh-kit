---
id: 2972748c-e54e-44a1-83e2-b2e58fbb5aba
---

# state 像快照

为什么 setState 后不能立即读到新值？渲染时 state 是什么？

## 设置 state 触发渲染

- `setState` 请求一次新的渲染;
- 不会修改当前已存在的 state 变量;

## 渲染快照

- 每次渲染时, state 是该次渲染的固定快照;
- 事件处理器中的 state 值在触发时已固定;

```jsx
function handleClick() {
  setCount(count + 1); // 本次渲染 count 仍为旧值
  console.log(count); // 旧值
}
```

## 同一事件多次 set

- 即使调用多次 setter, 本次渲染的 `count` 仍不变;
- 更新会排队到下一次渲染;

```jsx
setCount(count + 1);
setCount(count + 1); // 结果仍是 +1, 因为基于同一快照
```

## 理解

- state 变量在 JavaScript 闭包中像“当次渲染的照片”;
- 异步代码读取到的也是触发时的快照;

## 实践

- 需要基于最新值连续更新时, 使用更新函数 `setCount(c => c + 1)`;
- 不要把可变对象放在 state 中直接修改;
