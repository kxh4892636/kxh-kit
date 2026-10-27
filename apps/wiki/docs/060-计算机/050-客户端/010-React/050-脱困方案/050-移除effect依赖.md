---
id: 44694297-b6b7-49ae-85f9-74183e7084aa
---

# 移除 Effect 依赖

## 修改依赖列表前应该先检查什么？

- 代码决定依赖: 数组必须反映 Effect 实际读取的响应式值，想减少依赖必须改变读取方式或逻辑归属;
- 不抑制检查: 忽略 exhaustive-deps 会固定旧闭包并隐藏不同步问题，不能用禁用规则代替证明;

## 无关同步被同一个依赖触发时怎样拆分？

- 独立过程: 城市选项请求与地区详情请求若由不同输入决定，应拆成两个 Effect，各自具有自己的依赖和清理;
- 判断方法: 删除一个同步过程不应破坏另一个，才能作为两个独立 Effect；相关的建立与清理仍放在一起;

## 只为计算下一状态而读取旧 state 时怎样改写？

- 更新函数: 将 `setCount(count + 1)` 改成 `setCount(count => count + 1)`，把计算交给待处理状态，不再从 Effect 闭包读取 count;
- 语义限制: 只适用于从上一状态求下一状态的计算，不能据此省略其他真正参与同步的输入;

```jsx
useEffect(() => {
  const id = setInterval(() => setCount((count) => count + 1), 1000);
  return () => clearInterval(id);
}, []);
```

## 对象或函数每次创建导致重复同步时怎么办？

- 静态定义: 与 props/state 无关的对象或函数移到组件外，证明其不随渲染变化;
- 动态构造: 依赖 roomId 的 options 可以移到 Effect 内创建，数组直接依赖 roomId，而非每次新建的 options;
- 提取原始值: 接收对象 prop 时先找出真正需要的字符串、数字等输入，避免依赖整个对象引用;

```jsx
useEffect(() => {
  const options = { serverUrl, roomId };
  const connection = createConnection(options);
  connection.connect();
  return () => connection.disconnect();
}, [serverUrl, roomId]); // createConnection 是模块级函数
```

## 只需要读取最新值而不重新同步时怎么办？

- 事件语义: 只有属于 Effect 的事件才提取为 Effect Event，完整适用条件见区分事件与 Effect;
- 验证方式: 分别改变每个输入，检查该重连的确实重连、不该重连的仍读到正确值，并确认清理与建立对称;
