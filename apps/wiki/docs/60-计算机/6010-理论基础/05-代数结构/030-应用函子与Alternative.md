---
id: 18bdf35a-bff7-45b4-a90e-8f4d43316c42
---

# 应用函子与 Alternative

## 应用函子解决什么问题？

- 普通函子: `map` 把普通函数应用到容器里的值;
- 应用函子: `ap` 把容器里的函数应用到另一个同类容器里的值;

```text
map: (A -> B) -> F<A> -> F<B>
ap:  F<(A -> B)> -> F<A> -> F<B>
```

## 数组如何实现 `ap`？

- 当前数组保存函数，参数数组保存值;
- 每个函数映射全部值，结果连接成笛卡尔积;

```js
const ap = (functions, xs) => functions.reduce((results, fn) => results.concat(xs.map(fn)), []);

ap([(n) => n + 1], [1]); // [2]
```

## 为什么二元函数要先柯里化？

- 第一次 `ap` 消费第一个参数，产生一组仍等待第二参数的函数;
- 第二次 `ap` 消费第二个参数，得到最终组合结果;

```js
const add = (x) => (y) => x + y;
const partialAdds = ap([add], [1, 3]);
// [(y) => 1 + y, (y) => 3 + y]

ap(partialAdds, [4, 5]); // [5, 6, 7, 8]
```

## Alternative 在应用函子上增加了什么？

- Alternative: 同时具有应用函子结构与幺半群式选择结构;
- `alt` / `<|>`: 二元选择，常采用“第一个成功值获胜”;
- 单位元: 表示失败或空值，可安全退回下一候选;

```js
const Some = (value) => ({ value, alt: () => Some(value) });
const None = () => ({ value: null, alt: (other) => other });

const primary = None();
const secondary = Some({ port: 8080 });
const fallback = Some({ port: 3000 });

primary.alt(secondary).alt(fallback).value; // { port: 8080 }
```

## `map`、`ap` 与 `alt` 怎样分工？

| 操作  | 目的                       |
| ----- | -------------------------- |
| `map` | 用普通函数变换上下文值     |
| `ap`  | 用上下文函数组合上下文值   |
| `alt` | 在多个上下文计算间选择结果 |
