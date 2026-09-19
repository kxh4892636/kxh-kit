---
id: a8fb8cbe-bc53-44c7-9a0b-b7a35cb432ea
---

# WeakRef 与 FinalizationRegistry

- 基础: 可达性原理决定回收时机, 见 [垃圾回收](../007-执行上下文与内存/040-垃圾回收.md);

## 强引用与弱引用有什么区别？

| 类型   | 是否阻止回收 | 示例                          |
| ------ | ------------ | ----------------------------- |
| 强引用 | 阻止         | `let user = { name: 'John' }` |
| 弱引用 | 不阻止       | `new WeakRef(user)`           |

- 强引用: 只要还有强引用, 对象一定留在内存;
- 弱引用: 当剩下的引用全是弱引用时, 回收器可以随时回收该对象;
- 对照: `WeakMap`/`WeakSet` 的键也是弱引用, 见 [WeakMap 与 WeakSet](../004-引用类型/080-WeakMap与WeakSet.md);

## `WeakRef` 是什么？怎样取值？

- 构造: `new WeakRef(target)`, `target` 又称 referent;
- 特性: 不阻止 referent 被回收, 因此不保活;
- 取值: `deref()` 返回 referent; 已被回收则返回 `undefined`;

```js
let user = { name: "John" };
const admin = new WeakRef(user);

user = null; // 只剩弱引用, 对象"可能"还活着

const ref = admin.deref();
if (ref) {
  // 还活着, 可正常使用
} else {
  // 已被回收
}
```

## 为什么弱引用的对象像"薛定谔的猫"？

- 不可知: 没有任何 API 能提前判断 referent 是否已被回收;
- 不可控: 回收时机由引擎内部机制决定, 代码无法左右;
- 唯一做法: 用之前现场 `deref()` 确认一次, 然后按"可能为 `undefined`"写分支;
- 调试: 浏览器 DevTools 的 Performance 面板可手动 "Collect garbage", 但线上代码不能依赖这种手段;

## `WeakRef` 适合用在哪里？

- 场景: 做缓存或关联数组, 存放占内存大的对象 (如以 `ArrayBuffer`/`Blob` 表示的图像);
- 需求: 弱引用必须落在**值**上 —— `Map` 太强会一直占内存, `WeakMap` 的弱引用在键上, 都不合适;
- 组合: `Map<字符串键, WeakRef 值>`;

```js
function weakRefCache(fetchImg) {
  const imgCache = new Map();

  return (imgName) => {
    const cachedImg = imgCache.get(imgName);
    if (cachedImg?.deref()) return cachedImg.deref();

    const newImg = fetchImg(imgName);
    imgCache.set(imgName, new WeakRef(newImg));
    return newImg;
  };
}
```

- 收益: 命中则省一次下载/生成; 未命中则重新取回并放回缓存;
- 另一用途: 跟踪 DOM 元素 —— 元素从 DOM 移除后 `deref()` 变 `undefined`, 第三方逻辑据此自行停止工作;

## 只用 `WeakRef` 的缓存会残留什么？

- 泄漏: 大对象已被回收, 但 `Map` 里的字符串键还在, 死条目越积越多;
- 解法一: 周期性清扫缓存, 删掉"死"条目;
- 解法二: 用 `FinalizationRegistry` 在对象被回收时自动删键;

## `FinalizationRegistry` 是什么？怎样注册与注销？

- 术语: 清理回调 (finalizer) 是对象被回收后执行的函数; registry 负责登记对象与回调的对应关系;
- 构造: 回调只接收一个参数 `heldValue`;

```js
let user = { name: "John" };

const registry = new FinalizationRegistry((heldValue) => {
  console.log(`${heldValue} has been collected.`);
});

registry.register(user, user.name); // 对象被回收时打印 "John ..."
```

| 成员                                   | 作用                                       |
| -------------------------------------- | ------------------------------------------ |
| `register(target, heldValue[, token])` | 登记对象; 可选 `token` 供提前注销          |
| `unregister(token)`                    | 提前注销, `token` 通常直接用 `target` 本身 |

- 引用规则: registry 不强引用 `target` (否则对象永远回收不掉), 但会强引用 `heldValue` (对象时);

## 为什么清理回调不保证执行？

- 时机不保证: 对象被回收后, 回调只是"可能在未来某个时刻"执行, 中间有不确定的时间差;
- 程序结束: 整体退出 (如关闭浏览器标签页) 时可能不执行;
- registry 不可达: `FinalizationRegistry` 实例自身不再可达时, 注册的回调也可能不执行;
- 推论: finalizer 只能做"尽力而为"的清理, 不能承担必须完成的任务;

## 为什么清理回调里必须再检查一次？

- 时间差: 从对象被标记到回调真正执行, 主程序可以在此期间做任何改动, 甚至把对象重新接回内存;
- 风险一: 该键可能已被主程序重新加入缓存, 直接删会误删"活"条目;
- 风险二: 查缓存时值已被回收但回调还没跑, 于是读到 `undefined`;

```js
const registry = new FinalizationRegistry((imgName) => {
  const cachedImg = imgCache.get(imgName);
  if (cachedImg && !cachedImg.deref()) imgCache.delete(imgName);
});
```

- 结论: 回调内必须先确认 `deref()` 仍为 `undefined`, 再删键; 读缓存时也要按"可能已失效"处理;

## 什么情况下不该用 `WeakRef` / `FinalizationRegistry`？

- 默认答案: 绝大多数场景不需要 —— 普通缓存能自己掌控生命周期, 结果更稳定可预测;
- 反模式: 把 finalizer 当作资源释放的必经路径, 或依赖回收时机驱动业务逻辑;
- 心智成本: 要同时考虑"可能已回收"和"回调还没跑"两种中间态, 很容易写错;
