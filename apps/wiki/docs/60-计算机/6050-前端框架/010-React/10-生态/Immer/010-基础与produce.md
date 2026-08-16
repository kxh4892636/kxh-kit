---
id: b7467c02-9741-4e5f-8f05-4286a29c4a7f
---

# Immer 基础与 produce

Immer 是什么？`produce` 如何工作？

## 作用

- 以可变风格编写不可变更新;
- 解决 React state 需要不可变更新的繁琐问题;

## 安装

```bash
npm install immer
```

## 工作原理

- 基于 currentState 创建 draft;
- 在 draft 上直接修改;
- Immer 根据 draft 生成 nextState;

## produce

- `produce(baseState, recipe)` 返回新状态;
- recipe 的第一个参数是 draftState;

```js
import { produce } from "immer";

const nextState = produce(baseState, (draft) => {
  draft.push({ title: "Tweet about it" });
  draft[1].done = true;
});
```

## 注意

- draft 是 proxy, 不要返回 draft 本身;
- recipe 应保持纯净, 不要执行副作用;
- 对大型嵌套对象更新更简洁;
