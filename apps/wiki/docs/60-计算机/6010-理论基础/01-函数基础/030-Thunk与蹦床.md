---
id: f6a49765-799f-42be-b57d-68cbcfd59f3f
---

# Thunk 与蹦床

## Thunk 如何延迟一次计算？

- Thunk: 不接收参数、把表达式包起来的函数;
- 延迟: 创建 Thunk 时不求值，显式调用时才执行;
- 用途: 惰性求值、延迟副作用，以及蹦床递归;

```js
const thunk = () => 42 * 2;
thunk(); // 84
```

## 蹦床怎样避免深递归压满调用栈？

- 问题: 没有尾调用优化时，直接递归会不断增加调用栈;
- 改写: 每一步返回表示“下一步”的 Thunk，而不是立即递归;
- 蹦床: 用循环逐个执行 Thunk，直到得到普通值;

```js
const trampoline =
  (fn) =>
  (...args) => {
    let result = fn(...args);
    while (typeof result === "function") result = result();
    return result;
  };

const sumBelow = (n, acc = 0) => (n === 0 ? acc : () => sumBelow(n - 1, acc + n));

const safeSum = trampoline(sumBelow);
safeSum(1_000_000); // 500000500000
```

## Thunk 与蹦床各自负责什么？

| 机制  | 责任                         |
| ----- | ---------------------------- |
| Thunk | 把下一步计算表示成可调用的值 |
| 蹦床  | 循环执行这些值并收敛到结果   |

- 关键边界: 蹦床只对“返回 Thunk 的递归函数”有效;
- 最终效果: 递归控制流转为常量调用栈上的迭代过程;
