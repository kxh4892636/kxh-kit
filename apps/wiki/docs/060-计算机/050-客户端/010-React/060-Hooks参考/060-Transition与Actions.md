---
id: d29b7c78-3a0f-4998-a3d7-dfa834be5f4d
---

# Transition 与 Actions

## 如何让昂贵界面更新不阻塞紧急输入？

- Transition: 标记可让位于紧急更新的渲染工作, 被输入等更新打断后能重做;
- 澄清: 它不是把代码放到另一个线程;
- `useTransition`: 返回 `[isPending, startTransition]`;
- `isPending`: 是否还有待完成的 Transition;
- `startTransition`: 接收 Action 函数;
- 立即调用: `startTransition` 立即执行传入函数, 只有其中的状态更新被标记;
- 注意: 昂贵的同步 JavaScript 仍占主线程;

```jsx
const [isPending, startTransition] = useTransition();
function selectTab(nextTab) {
  startTransition(() => setTab(nextTab));
}
```

## 异步 Action 怎样包含等待后的更新？

- Action: Transition 中执行的函数可含异步工作;
- `isPending`: 持续到相关工作与最终 UI 更新完成;
- await 边界: 目前 `await` 之后的 setter 要再包一层 `startTransition` 才算 Transition;

## setTimeout 里的更新也算 Transition 吗？

- 同理: `setTimeout` 里的更新也不自动继承原范围;
- 请求顺序: 多个请求可能乱序完成, Transition 本身不保证业务顺序;
- 做法: 用 `useActionState` 的队列, 或自行取消、排序;

```jsx
startTransition(async () => {
  const next = await save(value);
  startTransition(() => setSaved(next));
});
```

## 为什么不能把受控输入的状态标记为 Transition？

- 输入反馈: input 的 value 必须随输入事件同步更新, 否则打字会出现不一致;
- 拆开状态: 输入文本按紧急更新处理;
- 昂贵结果: 放进 Transition, 或用 `useDeferredValue` 延迟展示;
- 没有 setter: 只有 prop 或 Hook 返回值可用时, `useDeferredValue` 比 `startTransition` 更合适;

```jsx
const [text, setText] = useState("");
const [query, setQuery] = useState("");
const [pending, startTransition] = useTransition();

function handleChange(event) {
  const next = event.target.value;
  setText(next);
  startTransition(() => setQuery(next));
}

const view = (
  <>
    <input value={text} onChange={handleChange} />
    {pending && <span>正在更新结果……</span>}
    <Results query={query} />
  </>
);
```

## 如何让等待状态不破坏已显示内容？

- 加载反馈: 用 `isPending` 标识正在切换;
- 收益: 已显示的 Suspense 区域不会被无谓 fallback 替换;
- 例外: 新边界仍可显示加载态;
- 业务组件: 暴露 action prop 时, 在自己的 Transition 里 await 调用者操作;
- 收益: 待处理反馈覆盖完整过程;
- 并发限制: 多个进行中的 Transition 目前可能被合并;
- 反例: 不要把 `isPending` 当作精确的单请求计数;
