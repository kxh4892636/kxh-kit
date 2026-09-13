---
name: code-spec
description: 编写、修改或审查代码时使用；核对目录层级、命名、代码规模、外部边界、测试布局及 TypeScript、CSS、React 规范。
---

逐个核对触及的目录、文件、函数和外部边界；全部适用规则满足或命中「全局例外」时完成。

## 目录与命名

- 项目内的 `src/` 为 `level-1`，不存在时以项目根为 `level-1`；最多 4 层，`level-4` 只放文件；每个目录直接包含的文件最多 13 个，超过时按领域归入文件夹。
- 文件和目录使用 `kebab-case`，按实际领域职责命名，如 `tab-group-state.ts`、`terminal-cleanup.ts`。
- 泛化名称（`helpers`、`utils`、`common`、`components`、`hooks` 等）仅在 `level-2` 允许。

## 文件与边界

- 文件最多 610 行、前端组件文件最多 377 行、函数最多 89 行；按物理行计数（含空行和注释），超过时按职责和复用边界重构。
- 网络、SDK、文件系统等外部边界有错误处理；
- 内部流转数据默认可信，无须 schema/validator。外部数据默认不可信：客户端 HTTP 响应递归使用 TypeScript 可选链防空指针；用户输入与服务端 RPC/HTTP 请求使用 schema/validator。
- 测试与实现同级放置；E2E 可单独放在 tests 目录。

## TS

- 使用箭头函数，参数和返回值有类型注解。
- 用 `const status = { pending: 'pending' } as const` 替代 `enum`，值联合类型从该对象派生。
- 确实无法收窄时通过 `type ISafeAny = any` 使用 `any`，其余情况使用明确类型。

## CSS

优先 Tailwind CSS；不存在时使用 SCSS/LESS/CSS Modules。

## React

- props 使用接口声明，最多 8 个属性，超过时重构组件。
- 使用箭头函数组件、`React.FC<Props>` 和命名导出；参数命名 `props` 并注明类型，在函数内解构。
- 按功能逻辑块组织组件，通用逻辑在顶部，最后返回 UI。

## 全局例外

工具链约定和自动生成的文件、目录除外；领域 skill 的规则优先。
