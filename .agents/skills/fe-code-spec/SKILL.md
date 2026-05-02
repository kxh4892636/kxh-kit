---
name: fe-code-spec
description: 前端编码规范与外部依赖使用说明，涵盖项目结构、命名、代码、组件、接口请求等规范及外部库/框架用法。执行 html/css/js/ts/react/vue 等前端开发任务时触发。关键词：前端、规范、项目结构、代码、组件、接口请求、外部依赖、第三方库。
---

# fe-code-spec

## 项目结构

```
src/
├── main.tsx          # React DOM 入口，挂载 <App />
├── app.tsx           # 应用外壳：全局 Provider（QueryClient、Router 等）
├── index.css         # 全局样式（如 @import "tailwindcss"）
├── assets/           # 静态资源（图片、SVG、字体等）
├── common/           # 共享常量、类型、枚举、配置等
├── components/       # 可复用 UI 组件
├── hooks/            # 自定义 Hook（数据请求、业务逻辑封装）
├── pages/            # 页面级组件
│   └── [page-name]/  # 页面组件，每个页面对应一个路由
│       ├── index.tsx  # 页面组件文件
│       ├── components/ # 页面内部私有组件目录
│       └── ...        # 与 src 目录结构一致
├── routes/           # 路由定义（每个路由文件导出对应页面组件）
├── stores/           # 状态管理（Zustand store 等）
├── api/              # 外部网络请求（如 fetch、axios 等）
└── utils/            # 纯工具函数
```

## 命名规范

- 文件命名使用 `kebab-case`;
- 变量/函数：`camelCase`
- 类/接口/枚举/泛型参数：`PascalCase`
- React 组件：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`
- CSS 类名选择器：`kebab-case`
- 布尔变量：`is/has/should` 前缀
- React 组件事件属性：`on` + 元素名 + 事件动词
- React 组件事件处理函数：`handle` + 元素名 + 事件动词

## 代码规范

### 文件限制;

- 单个组件文件不超过 377 行, 超过进行拆分;

### TypeScript 规范

- 使用 TypeScript 编写代码;
- 不允许使用 `any`，可使用 `ISafeAny` 代替;

```typescript
type ISafeAny = any;
```

### 函数规范

- 函数只能使用箭头函数, 不能使用普通函数;
- 函数参数和返回值必须使用类型注解, 函数参数统一定义为 `params`, 并在函数参数中使用解构赋值;
- 单个函数不超过 89 行, 超过 89 行进行代码拆分;

### 杂项

- 禁止使用 enum, 使用 const = {} as const 替代;
  - 枚举和枚举值的命名均使用 PascalCase;
- 模块导出/导入时, 除非框架需要默认导出/导入, 否则一律使用命名导出/导入;
- 任何数据类型, 使用其属性/方法, 必须使用 `?` 可选链操作符, 避免空指针异常;
- 使用第三方数据时, 例如 API 调用, 数据库查询, SDK 调用等, 必须使用 try-catch 包裹, 并在 catch 中使用 console.error 记录异常;

## React 规范

### 组件规范

- 组件属性必须有接口声明，命名为 `[ComponentName]Props`
  - 组件属性只使用 props 来定义, 组件内部使用解构赋值来获取 props;
- 使用 tailwindcss 或者 css modules;
  - 查询 package.json, 确认是否引入 tailwindcss, 优先使用 tailwindcss;
- 单个组件行数不超过 233 行, 超过进行组件拆分;
- 使用函数组件, 命名导出, 组件最外层目录使用 index.ts 统一导出组件;
- 组件内部的代码顺序如下:

```typescript
interface MyComponentProps {prop1: string; prop2: number;}

export const MyComponent: React.FC<MyComponentProps> = (props: MyComponentProps) => {
    // 属性解构
    const { prop1, prop2 } = props;

    // 功能逻辑块 1
    // 1. 状态变量, 如 useState, useRef, zustand;
    // 2. 自定义 hook, 如业务逻辑, 网络请求等;
    // 3. useEffect 依赖的函数, 按需使用 useMemo, useCallback 缓存;
    // 4. 副作用/生命周期 (useEffect);
    // 5. useEffect 无依赖的内部函数 (工具函数/事件处理), 按需使用 useMemo, useCallback 缓存;

    // 功能逻辑块 2
    // ...

    // UI 渲染逻辑
    return (<div></div>);
}
```

### 组件库规范

- PC 应用使用 `@ecom/auxo`
- H5 应用使用 `@ecom/auxo-mobile` 或者 `@arco-design/mobile-react`;
- 高级组件：`@ecom/auxo-pro-table`、`@ecom/auxo-pro-form`;
- 禁止在同一应用中混用不同的组件库;

## HTTP 请求规范

### 规则

- 优先使用 BAM 调用接口, 只有在缺少对应 API 或临时接入时才使用 `request(...)/fetch` 调用 HTTP 接口;
- 搜索同一项目中的网络请求函数, 仿照其实现方式;

### 请求流程

1. 使用 BAM 或者 request(...)/fetch() 封装 HTTP 接口请求函数;
2. 基于封装后的请求函数, 使用 `ahook` 或者 `react-query` 生成对应的 hook;
3. 在组件中使用 hook 来调用接口;

### hook 示例

#### 规则

- 使用 try-catch 包裹请求函数, 并在 catch 中使用 console.error 记录异常, 并返回与返回值类型相同的空值;
- 明确 hook 的参数和返回值类型;

#### react-query

```tsx
export const useGetCaseList = (params: CaseItemEnumReq) => {
  const caseQueryClient = useQuery({
    queryKey: ["case", params],
    queryFn: async () => {
      try {
        const res = await getCaseList(params);
        return res?.case_list || [];
      } catch (error) {
        console.error("getCaseList error", error);
        return [];
      }
    },
  });

  return {
    ...caseQueryClient,
  };
};
```

#### ahook

```tsx
import { GetItemList } from "@govern-public/api-ippro";
import { useRequest } from "ahooks";

export const useGetItemList = (params: GetItemListReq) => {
  const requestClient = useRequest(() => {
    try {
      return GetItemList(params) || [];
    } catch (error) {
      console.error("getItemList error", error);
      return [];
    }
  });

  return {
    ...requestClient,
  };
};
```

## 外部依赖官方文档

遇到以下依赖的使用问题或 API 查询时，优先查阅对应的官方文档：

| 依赖 | 官方文档 |
|------|----------|
| React | https://react.dev/ |
| TypeScript | https://www.typescriptlang.org/docs/ |
| Tailwind CSS | https://tailwindcss.com/docs |
| Zustand | https://zustand.docs.pmnd.rs/ |
| @tanstack/react-query | https://tanstack.com/query/latest/docs |
| @tanstack/react-router | https://tanstack.com/router/latest/docs |
| antd | https://ant.design/ |
| es-toolkit | https://es-toolkit.slash.page/ |
| ahooks | https://ahooks.js.org/ |
| @arco-design/mobile-react | https://arco.design/mobile/react |
| Vite | https://vite.dev/ |
| Vitest | https://vitest.dev/ |
| Vite+ (vp) | node_modules/vite-plus/docs 或 https://viteplus.dev/guide/ |
| Docusaurus | https://docusaurus.io/docs |

> **内部依赖**（无公开文档）：@ecom/auxo、@ecom/auxo-mobile、@ecom/auxo-pro-table、@ecom/auxo-pro-form、BAM。遇到这些库的问题时，搜索项目内现有用法作为参考。

## 检查与修复

- 代码开发任务执行完成后, 必须执行代码检查和修复;
