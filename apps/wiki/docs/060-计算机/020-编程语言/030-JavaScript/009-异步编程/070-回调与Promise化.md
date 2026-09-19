---
id: 67476982-d884-4d1a-933f-67ffa788f6d3
---

# 回调与 Promise 化

## 什么是回调式异步编程？

- 场景: 宿主提供的异步动作 (加载脚本、`setTimeout`、网络请求) 现在发起, 将来完成;
- 痛点: 发起后函数立即返回, 完成时无处返回值, 紧随其后的代码拿不到结果;

```js
loadScript("/my/script.js");
newFunction(); // 报错: 脚本还没加载完
```

- 约定: 把 "完成后要执行的函数" 作为 `callback` 参数传入, 由异步动作在完成时调用它;

```js
function loadScript(src, callback) {
  const script = document.createElement("script");
  script.src = src;
  script.onload = () => callback(script);
  document.head.append(script);
}

loadScript("/my/script.js", () => newFunction()); // 此时脚本已就绪
```

- 称呼: 这种风格就叫 "基于回调" 的异步编程; 后续环节见 [单线程与事件循环](./010-单线程与事件循环.md);

## 错误优先回调的约定是什么？

- 单回调双职责: 同一个 `callback` 既报告错误又回传结果;
- 约定一: 第一个参数留给错误, 出错时调 `callback(err)`;
- 约定二: 其后参数是成功结果, 成功时调 `callback(null, result1, result2...)`;

```js
function loadScript(src, callback) {
  const script = document.createElement("script");
  script.src = src;
  script.onload = () => callback(null, script);
  script.onerror = () => callback(new Error(`Script load error for ${src}`));
  document.head.append(script);
}

loadScript("/my/script.js", (error, script) => {
  if (error) {
    /* 处理错误 */
  } else {
    /* 使用 script */
  }
});
```

## 回调地狱是怎么形成的？

- 成因: 多个异步动作要按顺序执行, 只能把下一个动作写进上一个的回调里;
- 表现: 每加一个动作就多一层嵌套, 形成向右扩张的 "金字塔" (pyramid of doom);
- 后果: 层数一多难以阅读维护, 且 `if (error)` 在每个层级重复;

```js
loadScript("1.js", (error, script) => {
  if (error) handleError(error);
  else
    loadScript("2.js", (error, script) => {
      if (error) handleError(error);
      else
        loadScript("3.js", (error, script) => {
          /* 继续 */
        });
    });
});
```

- 拆平写法: 把每一步做成独立的顶层函数 (`step1`/`step2`/`step3`), 嵌套随之消失;
- 代价: 阅读时要在函数间来回跳, 且这些函数多为一次性, 还会污染命名空间;
- 替代: Promise 链能把同样的顺序写成扁平结构, 见 [Promise 基础与静态方法](./020-Promise基础与静态方法.md);

## 什么是 Promise 化？

- 定义: 把 "接受回调" 的函数改造成 "返回 Promise" 的函数;
- 动因: 大量现存函数与库基于回调, 而 Promise 更便于链式组合与配合 `async/await`, 见 [async 与 await](./030-async与await.md);
- 做法: 用 `new Promise` 包一层, 在回调里把 `err`/`result` 翻译成 `reject`/`resolve`;

```js
const loadScriptPromise = (src) =>
  new Promise((resolve, reject) => {
    loadScript(src, (err, script) => (err ? reject(err) : resolve(script)));
  });

loadScriptPromise("/my/script.js").then((script) => {
  /* ... */
});
```

## 如何手写一个 promisify？

- 思路: 返回包装函数, 把自定义回调追加到实参末尾, 再调用原函数;
- 默认格式: 假定原回调形如 `callback(err, result)`;
- 多结果版: `promisify(f, true)` 时用 `resolve(results)` 返回结果数组;

```js
function promisify(f, manyArgs = false) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      function callback(err, ...results) {
        if (err) reject(err);
        else resolve(manyArgs ? results : results[0]);
      }
      args.push(callback);
      f.call(this, ...args); // 保持原调用的 this
    });
  };
}

const loadScriptPromise = promisify(loadScript);
```

- 环境实现: Node.js 内置 `util.promisify`; 非错误优先格式 (如 `callback(result)`) 只能手动包装;

## Promise 化有什么边界？

- 只适用于回调仅被调用一次的函数; 此后再调用不会改变 Promise;
- 原因: Promise 只能有一个结果, 而回调在技术上可以被调用多次;
- 结论: Promise 化是更顺手的写法, 但不是回调的完全替代;
