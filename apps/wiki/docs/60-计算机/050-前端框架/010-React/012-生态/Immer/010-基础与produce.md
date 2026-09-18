---
id: b7467c02-9741-4e5f-8f05-4286a29c4a7f
---

# Immer 与不可变更新

## Immer 怎样减少嵌套更新的复制代码？

- 工作模型: produce 为旧状态提供 draft 代理，记录修改并生成新状态，未变化部分可以共享引用;
- 使用边界: 修改的是 draft，不是原始 React state，仍遵守不可变更新的目标;

```bash
npm install immer
```

## 如何修改 draft 得到新状态？

- 调用形式: `produce(baseState, recipe)` 把 draft 交给 recipe，结束后返回完成的新状态;
- 副作用限制: recipe 用于描述状态变化，不放网络请求或其他依赖执行次数的副作用;

```js
import { produce } from "immer";

const previous = [{ id: 1, done: false }];
const next = produce(previous, (draft) => {
  draft[0].done = true;
});
```

## 整体替换与修改 draft 应怎样选择？

- 修改模式: 修改 draft 后通常不返回值，允许返回 draft 本身但没有必要;
- 替换模式: 不修改 draft，直接返回新的完整值；不能同时修改 draft 又返回另一份替换数据;
- 赋值陷阱: `draft = newValue` 只改变局部变量，不会更新原 draft，应直接 return newValue;
- Undefined: 返回 undefined 被理解为没有显式替换，需要以 undefined 作为结果时使用 nothing 标记;

```js
const replaced = produce(previous, () => []);
```

## 如何避免 draft 泄漏与意外返回？

- 生命周期: 不把 draft 保存到 recipe 外继续使用，异步工作先取得结果，再同步生成下一状态;
- 箭头函数: 使用花括号函数体，避免 `draft => draft.push(item)` 把 push 返回的长度误当作整体替换值;
- 引用理解: 展示或保存 produce 的结果，而不是把代理当作长期可变对象;
