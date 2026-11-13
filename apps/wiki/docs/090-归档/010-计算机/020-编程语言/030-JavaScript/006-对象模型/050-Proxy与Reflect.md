---
id: 2b1d372f-62a9-4af9-9afa-36f524352800
---

# Proxy 与 Reflect

## 如何创建一个代理？

- 语法: 用 `new Proxy(target, handler)` 包装目标对象;
- 透传代理: `handler` 为空对象时行为与目标对象一致;
- 劫持: 在 `handler` 中定义与原生操作同名的方法 (trap), 命中时取代默认行为;

```js
const target = { foo: "bar" };
const proxy = new Proxy(target, {
  get() {
    return "handler override";
  },
});
target.foo; // "bar"
proxy.foo; // "handler override"
```

- 作用: 在不修改目标对象的前提下改变几乎任何原生操作的行为;

## Reflect 与 trap 如何配合？

- 语义: `Reflect` 上按同名同参提供目标对象的默认原生方法;
- 透传写法: `get: Reflect.get` 即可定义透传代理; `new Proxy(target, Reflect)` 也是完整的透传代理;
- 价值: 在 trap 中调用 `Reflect` 方法执行默认行为, 再插入自定义逻辑;
- 状态标志: `Reflect.defineProperty`、`Reflect.set`、`Reflect.deleteProperty`、`Reflect.preventExtensions`、`Reflect.setPrototypeOf` 返回布尔值而不是抛错, 便于判断成功与否;

```js
Function.prototype.apply.call(myFunc, thisVal, argumentList);
Reflect.apply(myFunc, thisVal, argumentList); // 更直观的一等函数写法
```

## 可撤销代理如何使用？

```js
const { proxy, revoke } = Proxy.revocable(target, handler);
revoke(); // 之后访问 proxy 抛 TypeError
```

## 有哪些 trap, 各自对应什么操作？

| trap                                       | 对应的原生操作                    | 返回值             |
| ------------------------------------------ | --------------------------------- | ------------------ |
| `get(target, property, receiver)`          | 读取属性                          | 任意值             |
| `set(target, property, value, receiver)`   | 设置属性                          | 布尔, 表示是否成功 |
| `has(target, prop)`                        | `in` 操作符                       | 布尔               |
| `defineProperty(target, prop, descriptor)` | `Object.defineProperty`           | 布尔               |
| `getOwnPropertyDescriptor(target, prop)`   | `Object.getOwnPropertyDescriptor` | 描述符或 undefined |
| `deleteProperty(target, property)`         | `delete` 操作符                   | 布尔               |
| `ownKeys(target)`                          | `Reflect.ownKeys`                 | 可枚举对象         |
| `getPrototypeOf(target)`                   | `[[GetPrototypeOf]]`              | 对象或 `null`      |
| `setPrototypeOf(target, proto)`            | `Object.setPrototypeOf`           | 布尔               |
| `isExtensible(target)`                     | `Object.isExtensible`             | 布尔               |
| `preventExtensions(target)`                | `Object.preventExtensions`        | 布尔               |
| `apply(target, thisArg, args)`             | 函数调用                          | 任意值             |
| `construct(target, args, newTarget)`       | `new`                             | 对象               |

- Trap invariants: 每个 trap 都必须满足一组不变量 (如 `isExtensible` 必须返回与目标一致的结果), 违反会抛 `TypeError`;

## 代理适合实现哪些模式？

- 追踪访问: 在 `get`/`set` 中记录读写, 用于日志与响应式;
- 隐藏属性: `get` 与 `has` 同时过滤敏感键, 保证读取与 `in` 判断一致;

```js
const hidden = ["foo", "bar"];
const proxy = new Proxy(target, {
  get: (t, p) => (hidden.includes(p) ? undefined : Reflect.get(t, p)),
  has: (t, p) => !hidden.includes(p) && Reflect.has(t, p),
});
```

- 属性校验: `set` 校验值类型, 不通过返回 `false`;
- 参数校验: `apply` 校验函数参数, `construct` 校验构造参数;
- 数据绑定: `construct` 收集新实例, `set` 在成功写入后触发通知, 实现可观察对象;

## 代理有哪些短板？

- 方法中的 this: 通过代理调用方法时, 方法内 this 是代理而不是原对象, 依赖内部槽的方法可能报错;
- 内部槽: `Map`、`Set`、`Date` 等依赖内部槽的对象被代理后不能直接调用其原生方法;
- 性能与可读性: 代理会引入额外调用开销, 过度使用会让行为难以追踪;
