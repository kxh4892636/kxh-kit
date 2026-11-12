---
id: 7799408e-1792-47f6-9890-5dc923a0a082
---

# Option 与 Either

## `Option` 如何表示可能缺失的值？

- `Option`: 含 `Some(value)` 与 `None` 两个分支的和类型;
- 用途: 组合可能没有返回值的函数;
- 别名: `Maybe`；`Some` 也称 `Just`，`None` 也称 `Nothing`;

```js
const Some = (value) => ({
  map: (fn) => Some(fn(value)),
  chain: (fn) => fn(value),
});
const None = () => ({
  map: () => None(),
  chain: () => None(),
});

const maybeProp = (key, object) => (object[key] === undefined ? None() : Some(object[key]));
```

## `chain` 怎样串联可能失败的读取？

```js
const getItem = (cart) => maybeProp("item", cart);
const getPrice = (item) => maybeProp("price", item);
const getNestedPrice = (cart) => getItem(cart).chain(getPrice);

getNestedPrice({}); // None()
getNestedPrice({ item: { price: 9.99 } }); // Some(9.99)
```

- 任一步得到 `None`，后续函数不再执行;
- 所有步骤成功，最终保留 `Some`;

## `Either` 如何同时保留失败原因？

- `Either`: `Left(error)` 与 `Right(value)` 两个分支的和类型;
- 约定: `Right` 表示成功，`Left` 保存错误或失败原因;
- 相比 `Option`: 不只表示失败，还携带失败信息;

```js
const Left = (value) => ({
  map: () => Left(value),
  chain: () => Left(value),
  fold: (onLeft) => onLeft(value),
});
const Right = (value) => ({
  map: (fn) => Right(fn(value)),
  chain: (fn) => fn(value),
  fold: (_onLeft, onRight) => onRight(value),
});
```

## `Either` 怎样把异常转成可组合值？

```js
const parseJson = (text) => {
  try {
    return Right(JSON.parse(text));
  } catch (error) {
    return Left(error.message);
  }
};

parseJson('{"user":"hemanth"}').map((obj) => obj.user);
// Right('hemanth')
parseJson("invalid").map((obj) => obj.user);
// Left('Unexpected token...')
```

## 应该选择 `Option` 还是 `Either`？

| 需求                   | 选择     |
| ---------------------- | -------- |
| 只关心值存在或缺失     | `Option` |
| 调用方需要知道失败原因 | `Either` |
