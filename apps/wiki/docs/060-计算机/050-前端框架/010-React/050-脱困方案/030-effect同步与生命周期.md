---
id: 866c0854-346d-4685-ac6d-4cd2fa9b8431
---

# Effect 同步与生命周期

## Effect 如何表达与外部系统的同步？

- 同步职责: 当组件呈现某种状态时，连接、订阅、媒体或第三方控件需要对应更新，Effect 描述这种持续关系;
- Setup 与 cleanup: setup 建立同步，返回的 cleanup 停止这一次同步；一个 Effect 对应一个独立同步过程;

```jsx
import { useEffect } from "react";

function Chat({ roomId, createConnection }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();
    return () => connection.disconnect();
  }, [roomId, createConnection]);
  return <p>当前房间：{roomId}</p>;
}
```

## 依赖变化时同步怎样停止并重新开始？

- 顺序: 初次提交后 setup，依赖改变后先用旧闭包 cleanup，再用新闭包 setup，卸载时执行最后一次 cleanup;
- 依赖比较: 固定长度的内联数组列出读取的响应式值，逐项用 Object.is 比较；组件内声明的变量与函数也可能是响应式值;
- 空数组: 表示没有响应式依赖，不代表跨重挂载或开发检查“永远只运行一次”；省略数组则每次提交后重新同步;
- 开发检查: StrictMode 的额外 setup/cleanup 用于检查恢复能力，不能用 ref 标记强行跳过来掩盖泄漏;

## 如何处理可撤销与不可撤销的外部操作？

- 订阅与连接: cleanup 取消监听、关闭连接、停止定时器，使下一次 setup 不会重复注册;
- 动画与控件: 清理时恢复必要状态，或调用控件提供的销毁方法；不要假设 Effect 一定只挂载一次;
- 不可撤销操作: 购买或提交订单属于具体交互，应从事件发起，不放到“组件显示了”就执行的 Effect 中;

## Effect 获取数据时如何避免旧请求覆盖新结果？

- 竞态防护: cleanup 标记旧同步失效，旧请求完成后不再写状态；这与真的取消网络请求是两件事;
- 架构选择: 框架加载器或数据缓存层通常更适合处理去重、缓存、预加载和网络瀑布，手写 Effect 需自己承担这些责任;

```jsx
useEffect(() => {
  let ignore = false;
  setData(null);
  fetchData(id)
    .then((result) => {
      if (!ignore) setData(result);
    })
    .catch((error) => {
      if (!ignore) setError(String(error));
    });
  return () => {
    ignore = true;
  };
}, [id]); // fetchData 是模块级函数
```
