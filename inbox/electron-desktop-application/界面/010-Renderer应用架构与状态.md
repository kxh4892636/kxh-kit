---
id: b5652901-35a4-460d-92cb-afbd18dff8e2
---

# Electron Renderer 应用架构与状态

## renderer 仍然是 Web 应用

- 运行环境: renderer 由 Chromium 执行，核心技术仍是 HTML、CSS、React 与浏览器 API;
- 桌面差异: renderer 通过 preload bridge 调用受控桌面能力;
- Lithe 入口: `src/renderer/src/main.tsx`;
- 根组件: `RouterProvider` 根据代码路由渲染 `AppShell` 和具体页面;
- 样式: Tailwind CSS 4 + shadcn preset `bcivVKXQ` + Base UI primitives;

## Provider 结构

```text
React.StrictMode
└─ QueryClientProvider
   └─ TooltipProvider
      └─ RouterProvider
         └─ AppShell
            └─ Outlet
```

- `StrictMode`: 在开发期帮助发现不安全副作用;
- `QueryClientProvider`: 为异步 server-state 风格数据提供缓存与请求状态;
- `TooltipProvider`: 为 shadcn tooltip 提供上下文;
- `RouterProvider`: 注入 TanStack Router;
- `AppShell`: 负责侧栏、标题栏和页面 outlet，不承担具体页面业务;

## TanStack Query 的职责

- 使用点: 首页通过 `window.lithe.runtime.getInfo()` 获取运行时信息;
- query key: `['runtime-info']` 标识缓存;
- loading: 未获得数据时显示 skeleton;
- fetching: 刷新时禁用按钮并旋转图标;
- stale policy: 运行信息默认永久 fresh，仅由用户显式刷新;
- 适用边界: 异步来源、需要 loading、error、cache、refetch 的数据;

## Zustand 的职责

- 使用点: `useThemeStore` 保存当前 theme 与 hydration 状态;
- 初始值: `system`;
- hydrate: 启动时经 IPC 从 SQLite 读取主题并应用到根元素;
- setTheme: 先更新 DOM 和内存，再经 IPC 持久化;
- system theme: 监听 `prefers-color-scheme`，仅在 theme 为 `system` 时响应;
- 适用边界: renderer 内共享的客户端状态和动作;

## Query 与 Zustand 的区别

| 维度       | TanStack Query                  | Zustand                   |
| ---------- | ------------------------------- | ------------------------- |
| 核心对象   | 异步来源的数据快照              | 客户端状态机              |
| 关注点     | 缓存、重试、刷新、loading/error | 状态、动作、订阅          |
| Lithe 示例 | Electron runtime info           | theme                     |
| 持久化     | 不负责业务持久化                | 通过 action 调 IPC 持久化 |

## i18n

- `i18next`: 保存语言资源和 fallback 规则;
- `react-i18next`: 通过 `useTranslation()` 把 key 映射为 React 文案;
- 首版语言: `zh-CN`;
- `fallbackLng`: 资源缺失时回退到中文;
- 价值: 文案从组件结构中抽离，未来添加语言不必重写组件;
- 边界: Electron 原生菜单、对话框和 main 错误文案需要单独国际化;

## 主题数据流

```text
应用启动 -> hydrate() -> IPC 读 SQLite -> applyTheme()
用户选择 -> setTheme() -> 更新 DOM/Zustand -> IPC 写 SQLite
系统主题变化 -> matchMedia event -> theme=system 时重新 applyTheme()
```

- DOM 表达: 根元素切换 `dark` class，并写入 `data-theme`;
- Tailwind 表达: dark variant 根据 class 选择颜色 token;
- E2E 证据: 选择深色、重启应用、确认 radio 与 dark class 同时恢复;

## renderer 边界

- 不直接导入 `electron`、`node:fs`、`node:sqlite` 或 child process;
- 不在组件中拼 IPC channel 字符串;
- 不把 Query 当作所有 UI 状态容器;
- 不把 Zustand 当作数据库;
- UI 状态与持久化失败时需要明确回滚或提示策略;
