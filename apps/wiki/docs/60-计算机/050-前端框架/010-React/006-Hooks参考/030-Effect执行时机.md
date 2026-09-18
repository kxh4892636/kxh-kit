---
id: 1a673ca4-8755-4254-aa6b-e59a9f41b6a7
---

# Effect Hooks 的执行时机

## 如何判断 useEffect 的执行相对绘制有何保证？

- 一般情况: 非交互引起的 Effect 通常允许浏览器先绘制；由交互引起时 React 可能在绘制前运行 Effect，因此不能承诺它永远绘制后执行;
- 更新区别: 即使某次 Effect 在绘制前执行，内部状态更新也可能稍后处理；必须阻止错误布局被显示时评估 useLayoutEffect;
- 客户端限定: Effect 不在服务端渲染执行，不能用它生成服务端必须输出的内容;
- 同步生命周期: setup、cleanup、依赖与竞态的完整解释见 Effect 同步笔记，不在这里重复;

## 如何在浏览器显示前完成布局测量？

- Layout Effect: DOM 提交后、浏览器绘制前运行，适合测量尺寸后调整位置，避免用户看到第一次错误布局;
- 性能代价: 其代码和触发的同步更新会阻塞绘制，优先用普通 Effect，确实需要布局一致性时才使用;
- 服务端限制: 服务端没有可测量的布局，组件应设计合理初始内容或明确仅在客户端显示;

```jsx
import { useLayoutEffect, useRef, useState } from "react";

function MeasuredBox() {
  const ref = useRef(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    setHeight(ref.current.getBoundingClientRect().height);
  }, []);
  return <div ref={ref}>高度：{height}</div>;
}
```

## CSS-in-JS 库何时使用 useInsertionEffect？

- 专门用途: 在其他布局 Effect 读取布局前插入样式，主要给 CSS-in-JS 库作者使用，不是应用代码的更快版 Effect;
- DOM 顺序: 可能在 DOM 更新前或后执行，不能依赖特定 DOM 更新时间；此时 ref 尚未关联，不能据此访问节点;
- 更新限制: 不在其内部更新 state；清理与建立按组件交错执行，不保证所有组件先清理再统一建立;

## Effect 中需要异步任务时怎样组织函数？

- 返回契约: setup 只能返回清理函数或不返回值，不能把 async 函数直接作为 setup，因为它返回 Promise;
- 内部任务: 在 setup 内调用异步函数，并提供竞态防护与失败处理，具体案例见 Effect 同步;
- 非响应式事件: useEffectEvent 的限制与使用例子归属区分事件与 Effect，它不是新的挂载时机;
