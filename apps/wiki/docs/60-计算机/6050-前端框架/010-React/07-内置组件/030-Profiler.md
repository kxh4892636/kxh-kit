---
id: 47d97d57-030e-4ee5-abc2-973382343295
---

# Profiler

## 如何测量一个 React 子树的渲染成本？

- 测量边界: `<Profiler id="..." onRender={callback}>` 包裹关心的子树，每次提交时通知回调;
- 开销范围: 测量本身有成本，生产环境默认构建不启用完整 profiling，需要专用 profiling 构建;
- 使用目的: 找到具体昂贵子树，再判断缓存或状态局部化是否有效，不以渲染次数单独评价性能;

```jsx
import { Profiler } from "react";

function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  console.table({ id, phase, actualDuration, baseDuration, startTime, commitTime });
}

const view = (
  <Profiler id="results" onRender={onRender}>
    <Results />
  </Profiler>
);
```

## onRender 的指标各自说明什么？

| 指标           | 用途                                        |
| -------------- | ------------------------------------------- |
| id             | 区分测量边界                                |
| phase          | mount、update 或 nested-update 阶段         |
| actualDuration | 本次更新实际花在子树渲染上的时间            |
| baseDuration   | 估计未利用缓存时完整渲染子树的成本          |
| startTime      | 本次渲染开始时间                            |
| commitTime     | 本次提交时间，可关联同次提交的多个 Profiler |

## 如何用指标判断缓存是否有效？

- 对照比较: 相似交互与数据规模下比较 actualDuration，若显著低于 baseDuration，通常说明部分工作被跳过;
- 测量条件: 使用一致构建和设备条件，开发 StrictMode、后台负载与浏览器扩展都可能影响结果;
- 因果核对: 改动后不仅看耗时，还要确认输出与交互保持正确，不能靠漏更新获得低数字;

## Profiler 能否代表用户感受到的全部延迟？

- 测量边界: 渲染时间不包含所有网络、浏览器布局、绘制与业务脚本成本，必须结合浏览器性能面板;
- 嵌套使用: 可逐步缩小边界定位热点，避免一开始给每个小组件都加测量;
