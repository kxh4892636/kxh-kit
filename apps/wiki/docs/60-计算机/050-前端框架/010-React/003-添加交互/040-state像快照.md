---
id: 2972748c-e54e-44a1-83e2-b2e58fbb5aba
---

# state 像快照

## 为什么 setter 后读取到的还是旧值？

- 快照: 一次渲染得到固定的 state 值，并据此计算 JSX、局部变量和事件处理器;
- 更新请求: setter 请求下一次渲染，不会修改当前函数已经读到的变量，因此后续语句仍使用这次快照;

```jsx
function handleClick() {
  setCount(count + 1);
  console.log(count); // 当前渲染的值
}
```

## 为什么连续三次加一可能只增加一次？

- 相同表达式: 若当前 count 为 0，三次 `setCount(count + 1)` 都提交 1，不会依次读到前一个 setter 的结果;
- 基于待处理值: 需要累计更新时使用更新函数，具体队列计算见[排队更新 state](./050-排队更新state.md);

```jsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  setCount(count + 1);
}
```

## 延迟回调为什么仍然读到旧快照？

- 闭包: 定时器、Promise 回调和异步处理器闭合在创建它们的那次渲染上，等待不会让已捕获的局部变量自动刷新;
- 业务含义: 如果提交动作需要记录“点击时”的收件人和内容，这种固定性正是需要的行为，不应一律替换成最新值;

```jsx
function handleSend() {
  const submittedMessage = message;
  setTimeout(() => {
    alert(submittedMessage);
  }, 1000);
}
```

## 需要读取最新数据时如何确定方案？

- 先澄清语义: 区分点击时快照、根据待处理状态计算、Effect 中读取最新值三种需求;
- 选择入口: 具体处理方式统一见[闭包与定时器](../005-脱困方案/080-闭包与定时器最佳实践.md)，避免仅为消除“旧值”而改变事件含义;
