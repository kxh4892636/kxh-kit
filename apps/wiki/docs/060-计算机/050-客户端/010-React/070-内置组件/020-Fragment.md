---
id: 3f492a3d-ff10-400d-a6ab-23a284445d31
---

# Fragment

## 如何分组元素而不增加 DOM 包裹层？

- 分组目的: 让多个 JSX 节点形成一个可返回的分组, 不改变实际 DOM 层级;
- 基础语法: 见组件与 JSX;
- 显式语法: 需要 key 或 ref 时用导入的 Fragment, 简写 `<>...</>` 不能收属性;
- key 规则: 见列表渲染;

## Fragment 的增减会重置子组件状态吗？

- 单层兼容: 单层 Fragment 与直接渲染同一 Child 的部分切换可保留状态;
- 例外: 单层数组分组也有兼容情形;
- 深度边界: 多层 Fragment 展开或结构变化可能重置状态;
- 反例: 不增加 DOM 不等于任意改分组都不改身份;
- 设计建议: 先保持稳定树结构, 确实需要重置时用业务 key, 不依赖复杂分组切换的偶然结果;

## 如何用 Fragment ref 操作一组节点？

- FragmentInstance: ref 关联的是一组节点的操作接口;
- 澄清: 不是额外 div, 也不是单个 `HTMLElement`;
- 焦点操作: `focus`、`focusLast`、`blur` 控制组内焦点;
- 顺序: 按嵌套子节点的深度优先找可聚焦节点;
- 版本条件: 用 Fragment ref 前先确认当前 React 版本提供该接口;
- 反例: 支持基本语法不等于支持 ref;

```jsx
import { Fragment, useRef } from "react";

function Fields() {
  const groupRef = useRef(null);
  return (
    <>
      <button onClick={() => groupRef.current?.focus()}>聚焦表单组</button>
      <Fragment ref={groupRef}>
        <input aria-label="姓名" />
        <input aria-label="城市" />
      </Fragment>
    </>
  );
}
```

## FragmentInstance 还能提供哪些组级操作？

| 能力 | 方法                                                 | 边界                                         |
| ---- | ---------------------------------------------------- | -------------------------------------------- |
| 事件 | addEventListener、removeEventListener、dispatchEvent | 第一层 DOM 子节点或 Fragment 事件            |
| 布局 | getClientRects、getRootNode、compareDocumentPosition | 返回组内几何或位置关系                       |
| 观察 | observeUsing、unobserveUsing                         | 连接已有 IntersectionObserver/ResizeObserver |
| 滚动 | scrollIntoView                                       | 让组内节点进入视区                           |

- 清理责任: 加监听与观察后要对称移除;
- 注意: 空 Fragment 或 React 与 DOM 顺序不同时, 不能当单节点测量;
