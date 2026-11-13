---
id: 2972748c-e54e-44a1-83e2-b2e58fbb5aba
---

# state 像快照

## 为什么 setter 后读取到的还是旧值？

- 快照: 一次渲染得到固定的 state 值, 并据此计算 JSX、局部变量和事件处理器;
- 更新请求: setter 只请求下一次渲染;
- 结果: 当前函数已读到的变量不变, 后续语句仍用这次快照;

```jsx
function handleClick() {
  setCount(count + 1);
  console.log(count); // 当前渲染的值
}
```

## 为什么连续三次加一可能只增加一次？

- 相同表达式: count 为 0 时, 三次 `setCount(count + 1)` 都提交 1;
- 原因: 不会依次读到前一个 setter 的结果;
- 基于待处理值: 需要累计更新时用更新函数;
- 队列计算: 见[排队更新 state](./050-排队更新state.md);

```jsx
function handleClick() {
  setCount(count + 1);
  setCount(count + 1);
  setCount(count + 1);
}
```

## 延迟回调为什么仍然读到旧快照？

- 闭包: 定时器、Promise 回调与异步处理器闭在创建它们的那次渲染上;
- 注意: 等待不会让已捕获的局部变量自动刷新;
- 业务含义: 提交动作要记录点击时的收件人与内容时, 这种固定性正是需要的;
- 反例: 不应一律换成最新值;

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
- 选择入口: 处理方式见[闭包与定时器](../050-脱困方案/070-闭包与定时器最佳实践.md);
- 反例: 不要只为消除旧值而改变事件含义;
