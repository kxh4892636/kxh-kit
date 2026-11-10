---
id: 46d45d9d-ae43-4060-a470-97ea34b9674e
---

# Suspense

## Suspense 在什么情况下显示 fallback？

- 挂起边界: 后代读到尚未就绪的受支持资源时, 最近的 Suspense 先给 fallback;
- 之后: 资源就绪再重试内容;
- 支持来源: `lazy` 的组件代码、`use` 读取的缓存 Promise;
- 也包括: 支持 Suspense 的框架数据集成;
- 非自动检测: Effect 或点击处理器里的普通 fetch 不会触发 Suspense;
- 做法: 自己做加载状态, 或用合适的数据层;

```jsx
import { Suspense } from "react";

const page = (
  <Suspense fallback={<p>加载页面……</p>}>
    <Profile />
    <Suspense fallback={<p>加载专辑……</p>}>
      <Albums />
    </Suspense>
  </Suspense>
);
```

## 什么是就绪内容与等待中的边界？

- 就绪内容: 当前已能完成渲染的组件, 不是某种特殊数据; 服务端可先输出它们;
- 等待边界: children 因 Promise 未完成而挂起时, 边界先占位成 fallback;
- 效果: 不阻塞其他区域;
- 揭示顺序: 外壳与 fallback 先发送, 各边界的真实内容按就绪时间后续补充;

```text
0 ms     Header + UserSkeleton + PostsSkeleton + Footer
100 ms   UserInfo 就绪，替换 UserSkeleton
2000 ms  PostList 就绪，替换 PostsSkeleton
```

## 如何选择一起显示还是逐步显示？

- 同一边界: 其直接受控的内容作为整体显示, 内部某部分等待会让该边界显示 fallback;
- 嵌套边界: 外层内容就绪后可先展示, 内层继续等待, 边界应对应产品希望看到的加载节奏;
- 不按文件机械拆分: 每个组件都包一层会造成碎片化占位与跳动, 按用户可理解的区域划分;

## fallback 必须是完全静态的吗？

- 首次要求: fallback 不必是纯静态 HTML;
- 但应: 轻量、可靠, 且能在当前阶段同步产出内容;
- 再次挂起: fallback 渲染时也挂起, 当前边界保护不了自己的 fallback;
- 接管者: 最近的外层 Suspense;
- 无外层边界: 服务端外壳必须等它就绪; 若最终拒绝或抛错, 可升级为外壳失败;
- 客户端异步: fallback 可以有 Effect、事件与 CSS 动画;
- 原因: 它们不阻塞服务端首次渲染;

```jsx
<Suspense fallback={<PageSkeleton />}>
  <Suspense fallback={<SmartLoading />}>
    <Content />
  </Suspense>
</Suspense>
```

- 传播结果: Content 挂起时尝试 SmartLoading;
- 再挂起: 改由外层显示 PageSkeleton;
