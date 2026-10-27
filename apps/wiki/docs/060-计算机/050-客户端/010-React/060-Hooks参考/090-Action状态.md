---
id: da469b09-1c37-4b0c-a782-e657b1c098bd
---

# Action 状态

## useActionState 如何保存带副作用操作的结果？

- 返回值: `useActionState(reducerAction, initialState, permalink?)` 返回 `[state, dispatchAction, isPending]`，state 来自最近操作返回值;
- 参数顺序: reducerAction 收到 previousState 和 payload；接入 form 后 FormData 是第二参数，不能沿用只有一个 FormData 参数的函数签名;
- 副作用允许: 与纯 useReducer 不同，reducerAction 可以等待请求和执行副作用，StrictMode 不会为纯度检查把它重复调用两次;

```jsx
import { useActionState } from "react";

function NameForm({ saveName }) {
  const [state, formAction, pending] = useActionState(
    async (previous, formData) => {
      try {
        await saveName(String(formData.get("name")));
        return { message: "保存成功" };
      } catch {
        return { message: "保存失败，请重试" };
      }
    },
    { message: "" },
  );
  return (
    <form action={formAction}>
      <input name="name" />
      <button disabled={pending}>保存</button>
      <p aria-live="polite">{state.message}</p>
    </form>
  );
}
```

## 手动派发 Action 时怎样保留 pending 语义？

- Action 上下文: 把 dispatchAction 交给 form action，或在 startTransition 内手动调用，不能在普通事件中裸调后期待完整 Transition 行为;
- 队列顺序: 同一 Hook 的多次派发按顺序执行，后一次 previousState 是前一次结果，dispatchAction 引用稳定;
- 返回类型: 返回值与初始状态应保持一致的数据类型和形状，否则后续操作与界面会难以处理;

## 操作失败时怎样选择返回状态还是抛出错误？

- 可恢复失败: 校验失败等业务结果可返回结构化状态，让表单显示消息并继续接受操作;
- 抛出异常: 未处理错误交给最近错误边界，并取消该 Hook 已排队的后续 Actions，不能假定它们仍会执行;
- 取消含义: 取消排队工作不等于撤销已经完成的服务端副作用；需要补偿时必须由业务接口设计;

## permalink 如何支持 JavaScript 加载前提交？

- 渐进增强: 与 Server Function 配合时，水合前提交可导航到指定页面；目标页需渲染同一个表单、Action 和 permalink 以接续状态;
- 可交互之后: 页面水合后 permalink 不再影响普通客户端提交；跨服务端边界的状态与载荷必须可序列化;
