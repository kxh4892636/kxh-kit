---
id: 1a673ca4-8755-4254-aa6b-e59a9f41b6a7
---

# Effect Hooks 的执行时机

## 如何判断 useEffect 的执行相对绘制有何保证？

- 一般情况: 非交互引起的 Effect 通常让浏览器先绘制;
- 交互引起时: React 可能在绘制前运行;
- 结论: 不能承诺永远在绘制后执行;
- 更新区别: Effect 在绘制前执行, 内部状态更新也可能稍后处理;
- 用 `useLayoutEffect` 的前提: 必须阻止错误布局被显示;
- 客户端限定: Effect 不在服务端渲染执行, 不能用它生成服务端必须输出的内容;
- 同步生命周期: setup、cleanup、依赖与竞态的完整解释见 Effect 同步笔记, 不在这里重复;

## 如何在浏览器显示前完成布局测量？

- Layout Effect: 在 DOM 提交后、绘制前运行;
- 适用: 测量尺寸后调整位置, 避免用户看到错误布局;
- 性能代价: 其代码与触发的同步更新都会阻塞绘制;
- 取舍: 优先用普通 Effect, 确需布局一致性时才用它;
- 服务端限制: 服务端没有可测量的布局, 组件应设计合理初始内容或明确仅在客户端显示;

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

- 专门用途: 在其他布局 Effect 读布局前插入样式;
- 用户: 主要是 CSS-in-JS 库作者;
- 澄清: 它不是应用代码的更快版 Effect;
- DOM 顺序: 可能在 DOM 更新前后执行, 不能依赖具体时间;
- 注意: 此时 ref 尚未关联, 不能据此访问节点;
- 更新限制: 不在其内部更新 state; 清理与建立按组件交错执行, 不保证所有组件先清理再统一建立;
