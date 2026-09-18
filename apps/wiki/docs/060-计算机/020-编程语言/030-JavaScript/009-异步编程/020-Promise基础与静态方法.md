---
id: 050c00f3-d656-4e23-a991-f063862cdfb3
---

# Promise 基础与静态方法

## Promise 的三种状态如何转换？

- 状态: `pending` (进行中)、`fulfilled` (成功)、`rejected` (失败);
- 限制: 状态只能从 `pending` 切换一次, 之后保持不变;
- 语义: Promise 是同步对象, 又是连接异步操作的媒介;
- 时机: `resolve`/`reject` 只是登记结果, 要等 executor 同步代码执行完才真正切换状态;

```js
const p1 = new Promise((resolve) => resolve("foo"));
const p2 = new Promise((_, reject) => reject("bar"));
```

## 解决值与拒绝理由如何使用？

- 参数: 解决值或拒绝理由会成为 `onFulfilled`/`onRejected` 的唯一参数;

```js
p1.then((value) => console.log(value)); // foo
p2.catch((reason) => console.log(reason)); // bar
```

## 为什么 Promise 的错误不能用同步 try/catch 捕获？

- 原因: 拒绝是异步通知, 只能用 `then` 的第二个参数或 `catch` 捕获;
- 表现: 拒绝会在其后的同步代码执行完之后才报告为未处理错误;
- 恢复: `catch` 正确处理错误后返回一个 `fulfilled` 状态的 Promise, 链可继续;

```js
try {
  Promise.reject(new Error("bar"));
} catch (e) {
  console.log(e); // 不会执行
}
```

## 什么是 thenable？

- 定义: 实现了 `then` 方法的对象即可被 `Promise.resolve` 接纳, 等效于 Promise;
- 用途: 让第三方异步实现与 Promise 互操作;

```js
const obj = { then: (resolve) => resolve("Hello") };
Promise.resolve(obj).then((value) => console.log(value)); // Hello
```

## Promise 提供哪些静态与实例方法？

| 成员                                    | 行为                                                |
| --------------------------------------- | --------------------------------------------------- |
| `Promise.resolve(value)`                | 返回以 `value` 解决的 Promise                       |
| `Promise.reject(reason)`                | 返回已拒绝的 Promise                                |
| `Promise.all(values)`                   | 全部成功时按输入顺序返回结果数组, 任一失败即失败    |
| `Promise.allSettled(values)`            | 等全部完成, 返回各状态与值, 不短路                  |
| `Promise.race(values)`                  | 返回第一个完成的 Promise                            |
| `Promise.any(values)`                   | 返回第一个成功的 Promise, 全失败抛 `AggregateError` |
| `Promise.try(fn)`                       | 把同步函数包装为 Promise                            |
| `Promise.withResolvers()`               | 返回 `{ promise, resolve, reject }`                 |
| `promise.then(onFulfilled, onRejected)` | 注册回调, 返回新 Promise                            |
| `promise.catch(onRejected)`             | 只注册拒绝回调                                      |
| `promise.finally(onFinally)`            | 成功失败都会执行                                    |

## all、race、any 会取消其它 Promise 吗？

- 结论: 不会终止其它 Promise 的执行;
- 表现: 结果确定后, 其余 Promise 仍在运行, 只是其结果无法再通过该组合获得;
