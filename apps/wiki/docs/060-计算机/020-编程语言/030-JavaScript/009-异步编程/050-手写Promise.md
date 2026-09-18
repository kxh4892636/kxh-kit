---
id: af64569d-5052-4cc9-af0f-ea3f6963d9b6
---

# 手写 Promise

## 手写 Promise 需要维护哪些状态？

- `state`: 当前状态, 取值 `pending`/`resolved`/`rejected`;
- `value`: 解决值或拒绝理由;
- `callbackList`: 状态尚未确定时缓存 `then` 注册的回调;
- `resolve`/`reject`: 切换状态并把缓存回调推入微任务队列;

```js
const PENDING = "pending";
const RESOLVED = "resolved";
const REJECTED = "rejected";

class MyPromise {
  constructor(executor) {
    this.state = PENDING;
    this.value = null;
    this.callbackList = [];

    const resolve = (value) => {
      if (this.state !== PENDING) return;
      this.state = RESOLVED;
      this.value = value;
      queueMicrotask(() => this.callbackList.forEach((cb) => cb.onResolved()));
    };

    const reject = (reason) => {
      if (this.state !== PENDING) return;
      this.state = REJECTED;
      this.value = reason;
      queueMicrotask(() => this.callbackList.forEach((cb) => cb.onRejected()));
    };

    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  then(onResolved, onRejected) {
    onResolved = typeof onResolved === "function" ? onResolved : (value) => value;
    onRejected =
      typeof onRejected === "function"
        ? onRejected
        : (reason) => {
            throw reason;
          };

    return new MyPromise((resolve, reject) => {
      const handle = (callback) => {
        try {
          const result = callback(this.value);
          if (result instanceof MyPromise) result.then(resolve, reject);
          else resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      if (this.state === RESOLVED) queueMicrotask(() => handle(onResolved));
      else if (this.state === REJECTED) queueMicrotask(() => handle(onRejected));
      else
        this.callbackList.push({
          onResolved: () => handle(onResolved),
          onRejected: () => handle(onRejected),
        });
    });
  }

  catch(onRejected) {
    return this.then(undefined, onRejected);
  }
}
```

## 如何手写 Promise.all 与 Promise.race？

- `all`: 逐个 `Promise.resolve` 归一化, 按索引写入结果, 全部完成后解决, 任一失败即拒绝;
- `race`: 同样归一化, 第一个改变状态的 Promise 决定结果;

```js
const customPromiseAll = (iterable) =>
  new Promise((resolve, reject) => {
    const promises = Array.from(iterable);
    const results = [];
    let completed = 0;
    if (promises.length === 0) return resolve(results);

    promises.forEach((promise, index) => {
      Promise.resolve(promise)
        .then((result) => {
          results[index] = result;
          if (++completed === promises.length) resolve(results);
        })
        .catch(reject);
    });
  });

const customPromiseRace = (iterable) =>
  new Promise((resolve, reject) => {
    for (const promise of Array.from(iterable)) Promise.resolve(promise).then(resolve, reject);
  });
```

- 规范来源: Promise A+ 规范定义了状态、行为与方法, 用于保证不同实现的兼容与互操作;
