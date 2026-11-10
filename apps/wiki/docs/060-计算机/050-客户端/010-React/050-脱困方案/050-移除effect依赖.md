---
id: 44694297-b6b7-49ae-85f9-74183e7084aa
---

# 移除 Effect 依赖

## 修改依赖列表前应该先检查什么？

- 代码决定依赖: 数组必须反映 Effect 实际读取的响应式值;
- 想减少依赖: 只能改读取方式或改逻辑归属;
- 不抑制检查: 忽略 `exhaustive-deps` 会固定旧闭包并盖住不同步问题;
- 反例: 禁用规则不能代替证明;

## 无关同步被同一个依赖触发时怎样拆分？

- 独立过程: 城市选项与地区详情由不同输入决定时拆成两个 Effect;
- 各自: 有自己的依赖与清理;
- 判断方法: 删掉一个同步过程不破坏另一个, 才算两个独立 Effect;
- 前提: 相关的建立与清理仍放一起;

## 只为计算下一状态而读取旧 state 时怎样改写？

- 更新函数: `setCount(count + 1)` 改成 `setCount(count => count + 1)`;
- 效果: 计算交给待处理状态, Effect 闭包里不再读 `count`;
- 语义限制: 只适用于从上一状态求下一状态的计算, 不能据此省略其他真正参与同步的输入;

```jsx
useEffect(() => {
  const id = setInterval(() => setCount((count) => count + 1), 1000);
  return () => clearInterval(id);
}, []);
```

## 对象或函数每次创建导致重复同步时怎么办？

- 静态定义: 与 props/state 无关的对象或函数移到组件外, 证明其不随渲染变化;
- 动态构造: 依赖 `roomId` 的 options 移到 Effect 内创建;
- 依赖数组: 直接写 `roomId`, 而不是每次新建的 options;
- 提取原始值: 接收对象 prop 时先找出真正需要的字符串、数字等输入, 避免依赖整个对象引用;

```jsx
useEffect(() => {
  const options = { serverUrl, roomId };
  const connection = createConnection(options);
  connection.connect();
  return () => connection.disconnect();
}, [serverUrl, roomId]); // createConnection 是模块级函数
```

## 只需要读取最新值而不重新同步时怎么办？

- 事件语义: 只有属于 Effect 的事件才提取为 Effect Event;
- 完整条件: 见区分事件与 Effect;
- 验证方式: 逐个改变输入, 看该重连的确实重连、不该重连的仍读到正确值;
- 还要确认: 清理与建立对称;
