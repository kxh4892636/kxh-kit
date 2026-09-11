---
id: d29b7c78-3a0f-4998-a3d7-dfa834be5f4d
---

# Transition 与 Actions

## 如何让昂贵界面更新不阻塞紧急输入？

- Transition: 标记可让位于紧急更新的渲染工作，被输入等更新打断后可以重做，不是把代码放进另一个线程;
- useTransition: 返回 `[isPending, startTransition]`，前者表示待完成的 Transition，后者接收 Action 函数;
- 立即调用: startTransition 会立即执行传入函数，只有其中的状态更新被标记，昂贵的同步 JavaScript 仍会占用主线程;

```jsx
const [isPending, startTransition] = useTransition();
function selectTab(nextTab) {
  startTransition(() => setTab(nextTab));
}
```

## 异步 Action 怎样包含等待后的更新？

- Action: Transition 中执行的函数可以包含异步工作，isPending 持续到相关工作与最终 UI 更新完成;
- await 边界: 当前 await 后的 setter 仍需再包 startTransition 才作为 Transition；setTimeout 中的更新也不自动继承原范围;
- 请求顺序: 多个请求可能乱序完成，原始 Transition 不自动保证业务顺序；可以使用 useActionState 的队列或自行取消、排序;

```jsx
startTransition(async () => {
  const next = await save(value);
  startTransition(() => setSaved(next));
});
```

## 为什么不能把受控输入的状态标记为 Transition？

- 输入反馈: input 的 value 必须随输入事件同步更新，否则打字会出现不一致;
- 拆开状态: 紧急更新输入文本，把昂贵结果的更新另放入 Transition，或将文本传给 useDeferredValue 延迟结果区域;
- 没有 setter: 只有 prop 或自定义 Hook 返回值可用时，useDeferredValue 比 startTransition 更适合;

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

- 加载反馈: 用 isPending 标识正在切换，Transition 可避免已显示的 Suspense 区域被不必要的 fallback 替换，新边界仍可显示加载态;
- 业务组件: 暴露 action prop 时可在自己的 Transition 中 await 调用者操作，让待处理反馈覆盖完整过程;
- 并发限制: 多个进行中的 Transition 当前可能被合并，不能把 isPending 当作精确的单请求计数;

## 组件外如何启动非阻塞更新？

- 独立 API: 从 react 导入 startTransition 可在普通模块使用，但不提供 isPending，适合数据层等没有 Hook 调用环境的地方;
- 引用稳定: useTransition 返回的启动函数身份稳定；Action 中错误的边界处理见错误边界笔记;
