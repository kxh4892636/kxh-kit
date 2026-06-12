---
name: code-spec
description: 全栈代码规范与专项开发指南。执行 html/css/js/ts/react/vue 前端开发、React 组件、接口请求、Zod 校验、TanStack Query/react-query、Vite+/vp、shadcn/ui、Ant Design/antd、第三方依赖、Hono API/中间件/部署、Drizzle ORM/Drizzle Kit/schema/migration/query 等代码任务时触发；当前通用规范以前端为主，专项规范通过 references 下的参考模块渐进披露。关键词：代码规范、前端、后端、React、Vue、TypeScript、接口请求、Zod、zod、TanStack Query、react-query、useQuery、useMutation、Vite+、vp、shadcn、Ant Design、antd、Hono、Drizzle、ORM、migration。
---

# code-spec

## 使用方式与渐进式披露

先判断“什么算完成”，再选择需要读取的规范层级：

1. 所有代码开发任务先读本文件，确认本次任务属于前端通用规范、组件体系专项规范、后端专项规范还是工具链规范。
2. 前端开发任务使用本文的项目结构、命名、组件、请求和检查规范；当前通用规范以前端 TypeScript 项目为主。
3. 任务涉及 Vite+/vp 时，先看本文的 Vite+ 工具链规范；只有具体命令、配置或故障细节不确定时，再读 `references/vite-plus/README.md` 和对应参考。
4. 任务涉及 shadcn/ui 时，先看本文的 shadcn/ui 快速规则；只有具体组件 API、CLI 行为或样式规则不确定时，再读 `references/shadcn/README.md` 和对应参考。
5. 任务涉及 Ant Design/antd 组件、主题、Form/Table、语义化 DOM、`classNames` 或 `styles` 时，读取 `references/antd/README.md`，再按需读取 `references/antd/references/component-map.md`、`references/antd/references/semantic-map.md` 和对应拆分文档。
6. 任务涉及 Hono API、路由、中间件、适配器、RPC、测试或部署时，读取 `references/hono/README.md`，再按需读取 `references/hono/references/source-map.md` 和具体官方 docs 快照。
7. 任务涉及 Drizzle ORM、Drizzle Kit、schema、relations、query、migration、seed 或数据库连接时，读取 `references/drizzle-orm/README.md`，再按需读取 `references/drizzle-orm/references/doc-map.md` 和具体官方 docs 快照。
8. 任务涉及 Zod schema、运行时校验、parse/safeParse、错误格式化、JSON Schema、codec、transform 或 Zod 迁移时，读取 `references/zod/README.md`，再按需读取 `references/zod/references/doc-map.md` 和具体官方 docs 快照。
9. 任务涉及 TanStack Query / React Query、QueryClient、useQuery、useMutation、queryKey、invalidateQueries、SSR/hydration、Suspense、乐观更新或服务端状态缓存时，读取 `references/react-query/README.md`，再按需读取 `references/react-query/references/doc-map.md` 和具体官方 docs 快照。
10. 只有任务涉及 React 组件、Hook、状态、数据请求、bundle、首屏渲染、交互性能或代码评审时，读取 `references/react/README.md`，再按需读取单条 React 规则。
11. 外部官方文档只在 API 不确定、版本差异可能影响实现、或用户明确要求查证时读取；内部依赖优先搜索项目内现有用法。

## 规范分层

- 本文件承载对外唯一暴露的 `code-spec` skill 入口和前端规范主体；后续新增通用后端规范时直接补充在本 skill 中。
- `references/hono/` 是 Hono 后端专项参考模块，保留官方 docs 快照和路由索引。
- `references/drizzle-orm/` 是 Drizzle ORM / Drizzle Kit 后端专项参考模块，保留官方 docs 快照、路由索引和刷新脚本。
- `references/zod/` 是 Zod 数据校验专项参考模块，保留官方 docs 快照、路由索引和刷新脚本。
- `references/react-query/` 是 TanStack Query React 服务端状态专项参考模块，保留官方 docs 快照、路由索引和刷新脚本。
- `references/vite-plus/` 是工具链参考模块；`references/shadcn/` 和 `references/antd/` 是组件体系参考模块，父文件只保留常用规则和路由入口。

以下项目结构提供前后端 TypeScript 项目的默认组织方式；命名、代码、React、HTTP 请求和检查规范仍以前端 TypeScript 项目为主，后端专项规则按需读取 Hono / Drizzle 参考模块。

## 项目结构

### 前端项目结构

```
src/
├── main.tsx          # React DOM 入口，挂载 <App />
├── app.tsx           # 应用外壳：全局 Provider（QueryClient、Router 等）
├── index.css         # 全局样式（如 @import "tailwindcss"）
├── assets/           # 静态资源（图片、SVG、字体等）
├── common/           # 共享常量、类型、枚举、配置等
├── components/       # 可复用 UI 组件
│   └── ui/           # shadcn/ui 组件源码（通过 CLI 添加后可按需维护）
├── hooks/            # 自定义 Hook（数据请求、业务逻辑封装）
├── pages/            # 页面级组件
│   └── [page-name]/  # 页面组件，每个页面对应一个路由
│       ├── index.tsx  # 页面组件文件
│       ├── components/ # 页面内部私有组件目录
│       └── ...        # 与 src 目录结构一致
├── routes/           # 路由定义（每个路由文件导出对应页面组件）
├── stores/           # 状态管理（Zustand store 等）
├── api/              # 外部网络请求（如 fetch、axios 等）
├── libs/              # 第三方组件体系需要的共享工具（如 shadcn/ui 的 cn）
└── utils/            # 纯工具函数
```

### 后端项目结构

```
src/
├── main.ts           # 服务启动入口，读取配置并监听端口或导出 runtime handler
├── app.ts            # Hono 应用装配：全局中间件、路由挂载、错误处理
├── config/           # 环境变量、运行时配置、常量
├── common/           # 共享类型、枚举、错误码、响应结构
├── routes/           # 路由定义，按业务域拆分并导出 Hono route
│   └── [domain]/     # 单个业务域
│       ├── index.ts  # 业务域路由聚合
│       ├── handlers.ts # 请求处理函数，只做入参、调用和响应组装
│       ├── schema.ts # 请求/响应校验 schema
│       └── types.ts  # 当前业务域类型
├── middleware/       # 认证、CORS、日志、错误、request id 等中间件
├── services/         # 业务逻辑，保持与 HTTP 框架解耦
├── db/               # 数据库连接、Drizzle schema、relations、migrations 辅助
│   ├── client.ts     # 数据库 client 初始化
│   ├── schema/       # Drizzle 表结构定义
│   └── queries/      # 可复用查询函数
├── libs/             # 外部 API、消息队列、对象存储、第三方 SDK 封装
├── utils/            # 纯工具函数
└── tests/            # 路由、service、db query 测试
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

- 单个文件不超过 377 行, 超过进行拆分;

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

- React + Tailwind PC 应用默认使用 `shadcn/ui`；它不是传统 npm 组件库，而是通过 shadcn CLI 将组件源码添加到项目中;
- 添加、更新、修复或组合 shadcn/ui 组件时，先看本节快速规则；执行命令前查看项目现有 UI 组件目录和工具函数目录，避免重复添加或导入不存在的组件;
- Vite+ 项目优先使用 `vp dlx -- shadcn@latest ... --cwd <project-path>`；非 Vite+ 项目按 `packageManager` 选择 `npx shadcn@latest`、`pnpm dlx shadcn@latest` 或 `bunx --bun shadcn@latest`;
- shadcn/ui 生成的 `components/ui` 源码保持官方组件结构；业务组件和页面代码继续遵守本 skill 的命名、拆分、props 和请求规范;
- 已经统一使用 Ant Design 的既有项目继续使用 `antd`；涉及组件 API、主题 token、Form/Table 复杂行为、`classNames`/`styles` 或语义化 DOM 时读取 `references/antd/README.md` 和本地中文官方文档快照;
- 已经统一使用内部 PC 组件库的既有项目可继续使用 `@ecom/auxo`，但不要在同一应用中再引入另一套 PC 组件库;
- H5 应用使用 `@ecom/auxo-mobile` 或者 `@arco-design/mobile-react`;
- 高级组件：`@ecom/auxo-pro-table`、`@ecom/auxo-pro-form`;
- 禁止在同一应用中混用不同的组件库;

### shadcn/ui 快速规则

- 先复用已添加的 shadcn/ui 组件，再写业务封装；不要用自定义 `div` 重做 Alert、Badge、Skeleton、Separator、Empty 等已有组件;
- 新增组件用 shadcn CLI 添加源码，添加后要读生成文件，检查导入路径、缺失子组件、图标库和本地规范是否匹配;
- 需要具体组件 API 时，运行 `shadcn@latest docs <component>` 获取官方文档和示例，再读取必要内容;
- 表单优先使用 shadcn 的表单组合结构，校验态同时给容器和控件设置状态属性;
- 弹窗、抽屉等 overlay 组件必须有标题；视觉隐藏时使用 `sr-only`;
- 图标放在按钮等组件内时使用组件约定的图标位置属性，不手写图标尺寸类;
- Tailwind 间距用 `gap-*`，等宽高用 `size-*`，颜色优先使用语义 token 或组件 variant;
- 更新已有 shadcn 组件时先预览差异，保留本地修改；只有用户明确批准时才覆盖本地组件文件。

## Vite+ 工具链规范

- Vite+ 是前端项目的统一入口，`vp` 负责依赖、开发、构建、检查、测试和任务执行；不要把 Vite+ 项目当作普通 Vite 项目绕过;
- 常规开发命令：`vp install` 安装依赖，`vp dev` 启动开发，`vp check` 格式化/lint/type check，`vp test` 跑测试，`vp build` 构建产物;
- Vite+ 配置统一放在 `vite.config.ts` 的 `defineConfig` 中，优先使用静态对象配置；不要新增 `vitest.config.ts`、`oxlintrc.json`、`oxfmtrc.json` 或 `tsdown.config.ts` 来分散配置;
- 内置命令不能覆盖；需要运行项目脚本或自定义任务时使用 `vp run <script>` 或 `vpr <script>`;
- 测试工具从 `vite-plus/test` 导入，不直接从 `vitest` 导入，除非当前项目明确不是 Vite+ 项目;
- 代码任务完成后按项目上下文执行 `vp check` 和 `vp test`，并检查是否需要通过 `vp run <script>` 运行 `package.json` 或 `vite.config.ts` 中的任务;
- 需要命令细节时读 `references/vite-plus/references/commands-reference.md`；需要配置细节时读 `references/vite-plus/references/config-reference.md`；涉及 `vp create` 组织模板、`create.defaultTemplate` 或 monorepo 根配置时读 `references/vite-plus/references/getting-started.md` 和 `references/vite-plus/references/monorepo.md`；排障时读 `references/vite-plus/references/troubleshooting.md`。

### React 性能规范

- 执行 React 组件、Hook、状态、数据请求、bundle 体积、首屏渲染、交互性能相关任务时，按需读取 `references/react/README.md`;
- `references/react/` 是本 skill 的 React 子参考内容，不是独立 skill；其结构为 `README.md`、`rules/_sections.md`、`rules/_template.md`、一条规则一个 Markdown 文件;
- `references/react/` 只包含通用 React / Vite 前端规则，源规则中只适用于特定框架的内容已删除;
- 实现时先遵守本文件已有的项目结构、命名、组件和请求规范，再使用 `references/react/rules/*.md` 中的详细规则补充性能、重渲染和渲染细节;

## 数据校验与服务端状态专项规范

当前 Zod 与 TanStack Query 规范通过 references 渐进披露，父文件只保留常用分流入口。

| 任务 | 先读 | 继续按需读取 |
|------|------|--------------|
| Zod schema、运行时校验、parse/safeParse、ZodError、refine/superRefine、transform、codec、JSON Schema 或 Zod 迁移 | `references/zod/README.md` | `references/zod/references/doc-map.md` 和 `references/zod/references/source-docs/` 中的相关文件 |
| TanStack Query / React Query、QueryClient、useQuery、useMutation、useInfiniteQuery、queryKey、invalidateQueries、SSR/hydration、Suspense、乐观更新或持久化 | `references/react-query/README.md` | `references/react-query/references/doc-map.md` 和 `references/react-query/references/source-docs/` 中的相关文件 |

- Zod 任务先确认校验发生在请求、表单、环境变量、外部 API 响应还是持久化 JSON 边界，再决定 schema 与错误形态。
- React Query 任务先确认现有 `QueryClient`、query key 约定、请求封装、错误处理和 SSR 框架，再新增 hook 或缓存策略。

## 后端专项规范

当前后端规范通过 references 渐进披露，避免把完整官方文档和框架细节堆进父文件。

| 任务 | 先读 | 继续按需读取 |
|------|------|--------------|
| Hono API、路由、中间件、helper、RPC、校验、JSX、测试、运行时适配或部署 | `references/hono/README.md` | `references/hono/references/source-map.md` 和 `references/hono/references/source-docs/` 中的相关文件 |
| Drizzle ORM / Drizzle Kit、schema、relations、query、migration、seed、数据库连接或方言差异 | `references/drizzle-orm/README.md` | `references/drizzle-orm/references/doc-map.md` 和 `references/drizzle-orm/references/source-docs/` 中的相关文件 |

- Hono 任务先确认 runtime、adapter、包管理器和 TypeScript 约束，再写匹配运行时入口的代码。
- Drizzle 任务先确认数据库方言、driver、迁移策略和是否会触碰真实数据库；`push`、`migrate`、`pull` 这类数据库影响命令需要明确目标环境后再执行或推荐。
- 后端代码同样遵守本仓库“先查现有模式、最小改动、贴近影响面验证”的原则。

## HTTP 请求规范

### 规则

- 优先用 ConnectRPC 生成的调用接口；
- 其次优先使用 BAM 调用接口；
- 只有在缺少对应 API 或临时接入时才使用 `request(...)/fetch` 调用 HTTP 接口;
- 搜索同一项目中的网络请求函数, 仿照其实现方式;

### 请求流程

1. 使用 ConnectRPC 或者 BAM 或者 request(...)/fetch() 封装 HTTP 接口请求函数;
2. 基于封装后的请求函数, 使用 `ahook` 或者 `react-query` 生成对应的 hook;
3. 在组件中使用 hook 来调用接口;

涉及 React Query 具体 API、query key、mutation/invalidation、SSR/hydration、Suspense 或缓存策略时，先读取 `references/react-query/README.md`，不要只凭示例扩展复杂行为。

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
        throw error;
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
      throw error;
    }
  });

  return {
    ...requestClient,
  };
};
```

#### ConnectRPC

```tsx
import { useQuery } from "@tanstack/react-query";
import { postsClient } from "../api/client";

export const usePosts = (random = true) => {
  const query = useQuery({
    queryKey: ["posts", random],
    queryFn: () => {
      try {
        return postsClient.getPosts({ random });
      } catch (error) {
        console.error("getPosts error", error);
        throw error;
      }
    },
  });
  const { data, ...rest } = query;

  return {
    ...rest,
    data: data?.posts,
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
| shadcn/ui | 先看本文的 shadcn/ui 快速规则，再查 https://ui.shadcn.com/docs |
| Ant Design / antd | 先看 `references/antd/README.md` 和本地中文官方文档快照，再查 https://ant.design/components/overview-cn/ |
| Zustand | https://zustand.docs.pmnd.rs/ |
| Zod | 先看 `references/zod/README.md` 和本地 docs 快照，再查 https://zod.dev/ |
| @tanstack/react-query | 先看 `references/react-query/README.md` 和本地 React docs 快照，再查 https://tanstack.com/query/latest/docs |
| @tanstack/react-router | https://tanstack.com/router/latest/docs |
| dayjs | https://day.js.org/ |
| es-toolkit | https://es-toolkit.slash.page/ |
| ahooks | https://ahooks.js.org/ |
| @arco-design/mobile-react | https://arco.design/mobile/react |
| Vite | https://vite.dev/ |
| Vitest | https://vitest.dev/ |
| Vite+ (vp) | 先看本文的 Vite+ 工具链规范，再查 `node_modules/vite-plus/docs` 或 https://viteplus.dev/guide/ |
| Docusaurus | https://docusaurus.io/docs |
| ConnectRPC | https://connectrpc.com/docs/web/getting-started |
| @connectrpc/connect | https://www.npmjs.com/package/@connectrpc/connect |
| @bufbuild/protobuf | https://buf.build/docs/protobuf-es |
| Hono | 先看 `references/hono/README.md` 和本地 docs 快照，再查 https://hono.dev/docs/ |
| Drizzle ORM | 先看 `references/drizzle-orm/README.md` 和本地 docs 快照，再查 https://orm.drizzle.team/docs/overview |

> **内部依赖**（无公开文档）：@ecom/auxo、@ecom/auxo-mobile、@ecom/auxo-pro-table、@ecom/auxo-pro-form、BAM。遇到这些库的问题时，搜索项目内现有用法作为参考。

## 检查与修复

- 代码开发任务执行完成后, 必须执行代码检查和修复;
- 只对 git change 中的代码进行检查和修复, 禁止检查其他代码;
