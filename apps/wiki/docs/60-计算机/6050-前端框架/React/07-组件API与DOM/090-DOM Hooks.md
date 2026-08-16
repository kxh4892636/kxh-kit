---
id: ae3437ae-584c-44ee-8bcb-c4ecf25001e7
---

# DOM Hooks

useFormStatus 如何读取表单提交状态？

## useFormStatus

- 只能在 `<form>` 内的组件中使用;
- 返回 `{ pending, data, method, action }`;
- 用于显示提交中状态、读取提交数据;

```jsx
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}>提交</button>;
}

function Form() {
  return (
    <form action={submit}>
      <SubmitButton />
    </form>
  );
}
```

## 返回值

- `pending`: 是否正在提交;
- `data`: 正在提交的 FormData;
- `method`: GET/POST;
- `action`: 当前 action 引用;

## 注意

- 必须由 `<form>` 祖先提供状态;
- 与 `useActionState` 不同: 它读取最近的 form 状态, 不管理 state;
