---
id: 962d5c5f-8f8f-4ec2-bf35-d48b804e2b0b
---

# ViewTransition

## 如何为界面切换启用视图过渡？

- 视图快照: ViewTransition 协调浏览器对切换前后界面的快照动画，不是逐个元素的布局动画引擎;
- 触发范围: Transition、Suspense 或延迟值驱动的相关更新可以激活动画，普通立即 setState 不会自动激活;
- 平台条件: 当前面向 DOM，使用前确认 React 与浏览器支持范围；React 负责协调浏览器过渡，不再同时手动调用 startViewTransition;

```jsx
import { startTransition, ViewTransition } from "react";

function Tabs({ tab, setTab }) {
  return (
    <>
      <button onClick={() => startTransition(() => setTab("details"))}>查看详情</button>
      <ViewTransition>
        <section>{tab}</section>
      </ViewTransition>
    </>
  );
}
```

## 进入、退出、更新与共享元素如何区分？

| 触发类型 | 含义                                    |
| -------- | --------------------------------------- |
| enter    | 边界作为插入子树中的相关入口出现        |
| exit     | 边界随对应子树删除                      |
| update   | 边界内部 DOM 或自身位置尺寸发生相关变化 |
| share    | 同次切换移除与新增边界具有相同 name     |

- 命名原则: 只有共享元素过渡需要显式 name，其他场景让 React 生成名称，避免同一界面名称冲突;

## 如何按切换原因选择动画样式？

- 类型标记: 在 startTransition 内调用 addTransitionType('next')，为该次提交附上业务原因，多个合并 Transition 会收集全部类型;
- 样式入口: enter、exit、update、share 与 default 可指定动画类或按类型映射，auto 使用默认效果，none 禁用;
- 生命周期: 类型在每次提交后重置，不能假设 fallback 提交的类型自动保留到之后内容揭示;

```jsx
import { addTransitionType, startTransition, ViewTransition } from "react";

function moveForward() {
  startTransition(() => {
    addTransitionType("forward");
    setPage((page) => page + 1);
  });
}

const content = (
  <ViewTransition enter={{ forward: "slide-in" }}>
    <Page />
  </ViewTransition>
);
```

## 什么时候需要使用动画事件回调？

- 编程控制: onEnter、onExit、onUpdate、onShare 可以通过提供的动画接口控制快照动画，普通效果优先使用 CSS;
- 布局冲突: 同步强制刷新、重复名称或其他代码并行启动浏览器过渡可能使动画被跳过，先排查更新路径再增加动画逻辑;
- 可访问性: 使用 prefers-reduced-motion 降低或禁用动画，React 不会自动替用户关闭所有视图过渡;

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```
