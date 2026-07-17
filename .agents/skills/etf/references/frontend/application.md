# Frontend Application

## 结构

`src` 是前端源码根，保留有意义的一级目录：

| 路径 | 职责 |
| --- | --- |
| `src/app` | 挂载、Provider、Router、根布局、配置与全局样式 |
| `src/pages/home/index.tsx` | `/` 的 lazy route 入口；现有 `index.tsx` 不重命名 |
| `src/features/market-dashboard/index.tsx` | 看板工作流编排；现有 `index.tsx` 不重命名 |
| `src/libs/api` | Connect Query 与生成客户端；保持整体边界 |
| `src/common` | 真正跨 feature 的共享领域内容；允许保留，但不作为杂物目录 |

不要在 feature 下创建 `components`、`hooks`、`utils` 等泛化目录；文件使用领域名并保持局部性。

## 应用与看板

- `app/main.tsx` 挂载 `AppProviders`，`app/providers.tsx` 装配外部 providers，`app/router.tsx` 持有路由树，`app/root-layout.tsx` 持有壳层。
- `market-dashboard/index.tsx` 编排证券、周期、范围、MA、摘要、加载和错误状态。
- `dashboard-toolbar.tsx` 与 `market-summary.tsx` 持有对应展示边界。
- `chart-data.ts` 持有周期聚合、范围裁剪和 MA 计算；`market-number-format.ts` 持有该 feature 的数字展示。
- `KlineChart` 是图表唯一页面接口；`kline-canvas.ts`、`kline-interactions.ts`、`kline-tooltip.tsx`、`ma-legend.tsx`、`use-ma-series.ts` 是 feature 私有实现，不从 feature 入口转出。

图表改动必须保持空数据、加载、刷新、错误、tooltip、缩放、拖拽和窄屏行为。样式使用 Tailwind；共享前先证明至少存在两个稳定消费者。
