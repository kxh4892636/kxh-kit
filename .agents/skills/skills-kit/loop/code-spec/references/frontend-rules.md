# Frontend Rules

读取本文件处理前端目录组织、React/Vue 页面与组件、组件库选择和前端 UI 代码规则。共享 TypeScript、注释和错误处理规则先读 `common-rules.md`。

## 项目结构

前端 TypeScript 项目默认组织：

```text
src/
├── main.tsx          # React DOM 入口，挂载 <App />
├── app.tsx           # 应用外壳：全局 Provider（QueryClient、Router 等）
├── index.css         # 全局样式（如 @import "tailwindcss"）
├── assets/           # 静态资源（图片、SVG、字体等）
├── common/           # 共享常量、类型、枚举、配置等
├── components/       # 可复用 UI 组件
├── hooks/            # 自定义 Hook（数据请求、业务逻辑封装）
├── pages/            # 页面级组件
│   └── [page-name]/
│       ├── index.tsx
│       ├── components/
│       └── ...
├── routes/           # 路由定义
├── stores/           # 状态管理（Zustand store 等）
├── api/              # 外部网络请求（如 fetch、axios 等）
├── libs/             # 第三方组件体系需要的共享工具
└── utils/            # 纯工具函数
```

## React 组件

- 组件属性必须有接口声明，命名为 `[ComponentName]Props`。
- 组件属性只使用 `props` 定义，组件内部使用解构赋值获取属性。
- 使用 Tailwind CSS 或 CSS Modules；先查 `package.json` 确认是否引入 Tailwind CSS，优先使用已有方案。
- 单个组件不超过 377 行，超过时拆分。
- 使用函数组件和命名导出，组件最外层目录使用 `index.ts` 统一导出。
- 组件内部按功能逻辑块组织，最后返回 UI，通用功能逻辑放置于顶部：

```typescript
interface MyComponentProps {prop1: string; prop2: number;}

export const MyComponent: React.FC<MyComponentProps> = (props: MyComponentProps) => {
  const { prop1, prop2 } = props;
  // 通用状态、自定义 hook、依赖函数、副作用。
  // 功能逻辑块 1：状态、自定义 hook、依赖函数、副作用。
  // 功能逻辑块 2：。。。

  return (<div></div>);
};
```

## Vue 组件

- 先读取项目内现有 Vue 写法，保持 `<script setup>`、组合式 API、状态管理和样式方案一致。
- props、emits、slot 和暴露方法要有明确类型。
- 页面组件、业务组件和纯 UI 组件分层，不把请求、权限和复杂状态塞进展示组件。

## 组件库

- 已经统一使用 Ant Design 的既有项目继续使用 `antd`；复杂组件 API、主题 token、Form/Table、`classNames`、`styles` 或语义化 DOM 读取 `references/antd/README.md`。
- 已经统一使用内部 PC 组件库的既有项目可继续使用 `@ecom/auxo`，但不要在同一应用中再引入另一套 PC 组件库。
- H5 应用使用 `@ecom/auxo-mobile` 或 `@arco-design/mobile-react`。
- 高级组件使用 `@ecom/auxo-pro-table`、`@ecom/auxo-pro-form`。
- 禁止在同一应用中混用不同组件库。

## 前端请求与状态

- 接口调用和 hook 封装读取 `http-requests.md`。
- TanStack Query / React Query 缓存、SSR、Suspense、乐观更新读取 `references/react-query/README.md`。
- React 性能、重渲染、bundle、首屏渲染、交互性能读取 `references/react/README.md`。
