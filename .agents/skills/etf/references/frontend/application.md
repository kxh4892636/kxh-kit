# Frontend Application

## 技术栈

- React 19 + TypeScript 6 + Vite + Tailwind CSS 4 + Ant Design。
- 使用 TanStack Router、TanStack Query、Zustand、ConnectRPC 和 Connect Query。
- Ant Design 样式通过 `@ant-design/cssinjs` 的 `StyleProvider` 装配。

## 入口与 Provider

- `src/main.tsx`：React 挂载入口，挂载到 `#app`。
- `src/app.tsx`：集中装配 `StyleProvider`、`ConfigProvider`、`AntdApp`、`TransportProvider`、`QueryClientProvider` 和 `RouterProvider`。
- `src/app.tsx` 的 `VITE_API_BASE_URL` 默认值是 `http://localhost:8080`，对应本地 `etf-service`。
- `src/routes/index.tsx`：TanStack Router 路由树。

## 路由与页面

- 当前只有 `/` 路由。
- `/` 在 `src/routes/index.tsx` 中声明，并 lazy 加载 `src/routes/lazy/home.lazy.tsx`。
- `home.lazy.tsx` 渲染 `src/pages/home-page/index.tsx`。
- `src/pages/index.tsx` 是根布局。

## 首页业务链路

- `src/pages/home-page/index.tsx` 串起标的列表、默认标的选择、日线查询、周期聚合、范围裁剪、均线输入、刷新和错误提示。
- `DashboardToolbar` 承载标的、周期、范围、均线和刷新控件。
- `MarketSummary` 展示当前查询结果摘要。
- `KlineChart` 和 `chart-renderer.ts` 负责 K 线绘制。
- `src/pages/home-page/hooks/use-ma-series.ts` 负责均线序列。
- `src/utils/chart-data.ts` 负责日/周/月等周期聚合和范围裁剪。
- `src/utils/format.ts` 负责数字和展示格式化。

## 变更注意

- 新增页面前先确认 `src/routes/index.tsx` 的路由树，不绕过 TanStack Router。
- 页面请求入口优先收敛在 `src/hooks/use-market.ts`，避免组件直接依赖生成客户端。
- 图表行为改动要同时检查空数据、加载中、请求失败和刷新中状态。
- 前端 BDD/TDD 维护原则见 `../test.md`；需求进入实现前，先确认对应测试或验收入口。
