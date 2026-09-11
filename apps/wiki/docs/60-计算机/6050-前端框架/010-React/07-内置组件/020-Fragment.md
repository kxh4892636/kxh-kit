---
id: 3f492a3d-ff10-400d-a6ab-23a284445d31
---

# Fragment

## 如何分组元素而不增加 DOM 包裹层？

- 分组目的: Fragment 让多个 JSX 节点形成一个可返回的分组，不改变实际 DOM 层级；基础语法见组件与 JSX;
- 显式语法: 需要 key 或 ref 时使用导入的 Fragment，简写 `<>...</>` 不能接收属性；列表 key 的完整规则见列表渲染;

## Fragment 的增减会重置子组件状态吗？

- 单层兼容: 单层 Fragment 与直接渲染同一 Child 之间的部分切换可保留状态，单层数组分组也有兼容情形;
- 深度边界: 多层 Fragment 展开或结构变化可能重置状态，不能把“不增加 DOM”推导成“任意改变分组都不改变 React 身份”;
- 设计建议: 先保持稳定树结构，确实需要重置时用业务 key，不依赖复杂分组切换的偶然结果;

## 如何用 Fragment ref 操作一组节点？

- FragmentInstance: ref 关联的是一组节点的操作接口，不是额外 div，也不是单个 HTMLElement;
- 焦点操作: focus、focusLast、blur 用于组内焦点控制，按嵌套子节点的深度优先顺序寻找可聚焦节点;
- 版本条件: 使用 Fragment ref 前确认当前 React 版本提供该接口，不能将基本 Fragment 语法支持等同于 ref 支持;

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

- 清理责任: 添加监听和观察后对称移除，空 Fragment 或 React/DOM 顺序不同的情况不能简单当作单节点测量;
