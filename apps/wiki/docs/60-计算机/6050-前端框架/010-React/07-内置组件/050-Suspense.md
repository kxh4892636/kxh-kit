---
id: 46d45d9d-ae43-4060-a470-97ea34b9674e
---

# Suspense

## Suspense 在什么情况下显示 fallback？

- 挂起边界: 后代渲染读取尚未就绪的受支持资源时，最近的祖先 Suspense 暂时显示 fallback，资源就绪后重试内容;
- 支持来源: lazy 组件代码、通过 use 读取的缓存 Promise，以及支持 Suspense 的框架数据集成;
- 非自动检测: Effect 或点击处理器里发起的普通 fetch 不会自动触发 Suspense，需要自己的加载状态或合适的数据层;

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

- 就绪内容: 当前已能完成渲染的组件，不是某种特殊数据；服务端可先输出它们;
- 等待边界: Suspense 的 children 因 Promise 未完成而挂起，边界先占位为 fallback，不阻塞其他区域;
- 揭示顺序: 外壳与 fallback 先发送，各边界的真实内容按就绪时间后续补充;

```text
0 ms     Header + UserSkeleton + PostsSkeleton + Footer
100 ms   UserInfo 就绪，替换 UserSkeleton
2000 ms  PostList 就绪，替换 PostsSkeleton
```

## 如何选择一起显示还是逐步显示？

- 同一边界: 其直接受控的内容作为整体显示，内部某部分等待会让该边界显示 fallback;
- 嵌套边界: 外层内容就绪后可先展示，内层继续等待，边界应对应产品希望看到的加载节奏;
- 不按文件机械拆分: 每个组件都包一层会造成碎片化占位与跳动，按用户可理解的区域划分;

## fallback 必须是完全静态的吗？

- 首次要求: fallback 不必是纯静态 HTML，但应轻量、可靠并能在当前阶段同步产出内容;
- 再次挂起: fallback 渲染时也挂起，当前边界不能保护自己的 fallback，由最近的外层 Suspense 接管;
- 无外层边界: 服务端外壳必须等它就绪；若最终拒绝或抛错，可升级为外壳失败;
- 客户端异步: fallback 可以有 Effect、事件和 CSS 动画，因为它们不阻塞服务端首次渲染;

```jsx
<Suspense fallback={<PageSkeleton />}>
  <Suspense fallback={<SmartLoading />}>
    <Content />
  </Suspense>
</Suspense>
```

- 传播结果: Content 挂起时尝试 SmartLoading；SmartLoading 也挂起时，改由外层显示 PageSkeleton;

## 重试与重新隐藏会怎样影响状态？

- 首次未挂载: 初次挂起的树尚未成功挂载，其状态不会被保留为已完成实例，React 在资源就绪后重新尝试;
- 已显示后挂起: 普通更新可能再次显示 fallback，已隐藏内容的布局 Effect 会清理并在重新显示时建立;
- 保留旧内容: Transition 或 useDeferredValue 可以让已有内容在等待时继续显示，具体选择见对应 Hooks;

## Suspense 如何参与服务端渲染与错误恢复？

- 流式输出: 服务端先发送可用外壳与 fallback，之后逐步补充边界内容;
- 服务端失败: 边界内服务器渲染失败时可保留 fallback 并在客户端重试，客户端也失败才交给错误边界;
- 错误区分: Suspense 表达等待，错误边界表达失败，不用加载动画代替失败提示;
- 错误流程: 服务端外壳、边界错误与客户端重试见 [服务端渲染错误与输出](../08-DOM与渲染/040-服务端渲染错误与输出.md);
