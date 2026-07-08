---
name: code-spec
description: 前后端代码规范与专项开发指南。执行 html/css/js/ts/react/vue 前端开发、Go 后端开发、API/接口请求、React 组件、Zod 校验、TanStack Query/react-query、Vite+/vp、Ant Design/antd、第三方依赖或代码注释规范任务时触发；通用规则、前端规则和后端规则分层披露。关键词：代码规范、注释规范、说明性注释、前端、后端、API、React、Vue、TypeScript、Go、接口请求、Zod、zod、TanStack Query、react-query、useQuery、useMutation、Vite+、vp、Ant Design、antd。
---

# code-spec

本文件只做任务分流和最低限度约束。具体规范按任务需要读取对应 reference，避免一次性加载所有细节。

## 使用方式

1. 先判断本次任务“什么算完成”，再选择最小需要读取的规范。
2. 优先搜索项目内现有模式；只有 API 不确定、版本差异可能影响实现、或用户明确要求查证时，再读取外部官方文档。
3. 只读取本次任务相关 reference；不要因为任务是前端任务就加载全部参考模块。
4. 代码开发完成后按项目上下文做贴近影响面的验证。

## 任务路由

| 任务 | 先读 | 继续按需读取 |
|------|------|--------------|
| 命名、文件组织、TypeScript 类型、函数拆分、模块导入导出、注释、错误处理 | `references/common-rules.md` | 最近项目规则和同目录现有实现 |
| 小范围 JS/TS 代码修改，不涉及 UI、网络、DB 或框架 API | `references/common-rules.md` | 只搜索受影响文件附近模式 |
| React/Vue 页面、组件、样式、组件拆分、组件库选择 | `references/frontend-rules.md` | React 任务再读 `references/react/README.md` |
| React Hook、状态、渲染性能、bundle、首屏、交互性能或 React 代码评审 | `references/react/README.md` | `references/react/rules/*.md` 中相关规则 |
| Ant Design/antd 组件 API、主题、Form/Table、语义化 DOM、`classNames`、`styles` | `references/antd/README.md` | `references/antd/references/component-map.md`、`references/antd/references/semantic-map.md` |
| 接口请求、请求函数封装、前端 hook、ConnectRPC/BAM/fetch 选择 | `references/http-requests.md` | 使用 React Query 时再读 `references/react-query/README.md` |
| TanStack Query / React Query、QueryClient、queryKey、useQuery/useMutation、缓存、失效、SSR/hydration、Suspense、乐观更新 | `references/react-query/README.md` | `references/react-query/references/doc-map.md` |
| Go 后端架构、API/RPC 路由、handler/controller、service/use case、repository、integration、middleware、后台任务 | `references/backend-rules.md` | 当前项目 Go 框架、ORM/driver、RPC 和现有实现 |
| Go 数据库连接、事务、migration、seed、批量更新/删除、真实数据影响操作 | `references/backend-rules.md` | 项目数据库配置、迁移脚本和官方 ORM/driver 文档 |
| Zod schema、运行时校验、parse/safeParse、错误格式化、JSON Schema、codec、transform、迁移 | `references/zod/README.md` | `references/zod/references/doc-map.md` |
| Vite+/vp、依赖、构建、测试、检查、workspace 命令、工具链配置 | 本文“Vite+ 最小规则” | `references/vite-plus/README.md` 与 `references/vite-plus/references/source-map.md` |
| 第三方依赖 API 查询、官方文档查证、内部依赖用法查找 | 本文“外部文档入口” | 项目内现有用法或对应官方文档 |

## Vite+ 最小规则

- Vite+ 项目统一使用 `vp` 负责依赖、开发、构建、检查、测试和任务执行；不要把 Vite+ 项目当作普通 Vite 项目绕过。
- 常规开发命令：`vp install`、`vp dev`、`vp check`、`vp test`、`vp build`。
- 运行 package script 使用 `vp run <script>` 或 `vpr <script>`；不要直接调用 `pnpm`、`npm`、`yarn`、`vite`、`vitest`、`oxlint` 或 `oxfmt`。
- Vite+ 配置统一放在 `vite.config.ts` 的 `defineConfig` 中；不要新增 `vitest.config.ts`、`oxlintrc.json`、`oxfmtrc.json` 或 `tsdown.config.ts` 分散配置。
- 测试工具从 `vite-plus/test` 导入，除非当前项目明确不是 Vite+ 项目。

## 核心完成检查

- 变更直接对应用户需求，没有顺手改无关模块。
- 已读取最近的项目规则和本次任务需要的 reference。
- 代码遵循项目现有模式；新增抽象有明确收益。
- 通用规则、前端规则、后端规则没有混用；只读取本次任务需要的层级。
- 网络请求、第三方数据、数据库/SDK 调用、文件系统和后台任务等风险边界有错误处理。
- 注释只解释原因、约束、取舍和风险；不复述代码动作。
- 只对 git change 中的相关代码做检查和修复。

## 参考模块

- `references/common-rules.md`：JavaScript/TypeScript 命名、类型、函数、模块、注释、错误处理和检查规则。
- `references/frontend-rules.md`：前端目录、React/Vue 组件和组件库选择规则。
- `references/backend-rules.md`：Go 后端目录、API/RPC、service/use case、repository、integration、后台任务和数据库操作边界规则。
- `references/http-requests.md`：接口请求选择、hook 封装和示例。
- `references/antd/`：Ant Design 中文官方文档快照和路由索引。
- `references/react/`：React 性能与评审规则。
- `references/react-query/`：TanStack Query React 官方文档快照。
- `references/vite-plus/`：Vite+ 命令、配置、迁移、CI、IDE 和排障文档。
- `references/zod/`：Zod 官方文档快照。
