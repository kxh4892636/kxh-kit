---
id: 1925b073-5e06-4f60-9634-840ac4143ffa
---

# async 与 await

## async 函数的返回值是什么？

- 声明: `async function foo() {}`、`async () => {}`;
- 返回: 调用后立刻返回一个 `pending` 状态的 Promise;
- 成功: 函数体正常执行完, Promise 变为 `fulfilled`, 解决值为返回值;
- 失败: 函数体抛出异常, Promise 变为 `rejected`;

## async 函数如何处理错误？

- `throw`: 使返回的 Promise 进入 `rejected`;
- `return Promise.reject(err)`: 返回值是拒绝的 Promise, 会被链式 `catch` 捕获;
- 直接调用 `Promise.reject(err)`: 只是创建了一个未处理的拒绝, 不会进入本函数的 `catch`;
- 结论: 要传播错误就用 `throw` 或 `return`, 不要忽略返回的 Promise;

## async 的传染性是什么？

- 现象: 底层函数改成 `async` 后, 依赖它的调用链要改成 `await`, 否则拿到的是 Promise 而不是结果;
- 终止方式: 在某一层改用 `promise.then()` 处理, 不再向上传染;

## await 的执行机制是什么？

1. 先执行 `await` 后表达式中的同步代码;
2. 暂停当前 async 函数, 把剩余代码作为整体推入微任务队列, 并跳出函数;
3. 主线程继续执行后续同步代码;
4. 表达式的值就绪后, 从微任务队列恢复函数执行;

```js
let i = 0;
queueMicrotask(function test() {
  i++;
  if (i < 3) queueMicrotask(test);
});
(async () => {
  for (let j = 1; j < 3; j++) {
    await null;
    console.log("resume", j);
  }
})();
console.log("sync end");
// sync end → resume 1 → resume 2; 每次 await 让出一个微任务
```

## await 的返回值与错误如何处理？

- 解包: `await` 会取出 Promise 的解决值, 等价于 `then` 的回调参数;
- 非 Promise: 视为已解决的 Promise, 直接得到该值;
- 错误: 被拒绝的 Promise 若不 `await` 不会被 async 函数捕获; 加 `await` 后可用 `try...catch` 捕获;

```js
try {
  await Promise.reject(new Error("Oops!"));
} catch (error) {
  error.message; // "Oops!"
}
```

- 常用封装: 把 Promise 转成 `[error, data]` 元组, 避免层层 `try...catch`;

```js
const to = (promise) => promise.then((data) => [null, data]).catch((err) => [err, undefined]);
```

## 不使用 await 的 async 函数有异步效果吗？

- 结论: 没有; 函数体的同步部分照常同步执行, 只是返回值被包装成 Promise;

```js
async function foo() {
  console.log(2);
}
console.log(1);
foo();
console.log(3);
// 1 2 3
```

## 顶层 await 有什么限制？

- 位置: 只能写在模块最外层;
- 条件: 仅 ESM 模块, 且在支持 ES2022 之后的环境可用;
- 影响: 含顶层 await 的模块会延迟其自身及依赖者的求值, 详见 [ESM 加载机制](../015-模块化/030-ESM加载机制.md);
