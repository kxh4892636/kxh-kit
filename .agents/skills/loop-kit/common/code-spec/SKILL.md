---
name: code-spec
description: 代码规范；编写、修改或审查代码时使用，覆盖通用规则及 Go、TypeScript、CSS、React。
---

## 目录层级

- 将 `/src` 视为`level-1`，若 `/src` 不存在，则视为项目根目录（`/`）。
- 目录层级禁止超过 4 层目录，`/level-4` 下只能包含文件，即 `/level-1/level-2/level-3/level-4/index.ts` 。

## 命名规范

- 文件夹和文件的名称使用 `kebab-case`；
- 文件夹和文件应按实际内容使用领域名称（如 `tab-group-state.ts`、`terminal-cleanup.ts`），禁用 `helpers`、`utils`、`common`、`components`、`hooks` 等不传递信息、易沦为杂物堆的泛化名称（如 `tabs-helpers.ts`、`terminal-utils.ts`）。若只能想到此类名称，通常说明文件职责过多需拆分，或应按函数的操作对象命名。
- `level-2` 允许使用 `libs`、`utils`、`config`、`components`、`hooks` 等泛化名称。

## 代码文件

- 单个文件不超过 610 行，单个函数不超过 89 行，超过时拆分，优先按职责和复用边界进行拆分；
- 默认使用命名导出/导入，除非需要默认导出/导入；

## 代码注释

- 注释保持简洁，最大不超过 8 行。
- 注释只写说明性注释，解释代码背后的原因、约束、取舍和风险。
- 禁止用注释复述代码正在做什么或如何执行。

## 风险边界

- 网络请求、SDK 调用、文件系统等外部边界必须有错误处理。
- 错误处理中使用 error log 或者日志工具记录异常。
- 外部数据默认不可信，使用项目 schema/validator 收窄类型。

## TS

- 函数使用箭头函数，不使用普通函数，函数参数和返回值必须有类型注解。。
- 禁止使用 `enum`，使用 `const = {} as const` 替代，需要值联合类型时，从 const 对象派生。
- 外部数据默认不可信，递归使用 `?` 可选链，避免空指针异常。
- 禁止使用 `any`，确有无法收窄的数据类型，使用 `ISafeAny`，没有创建 `type ISafeAny = any`。

## CSS

- css 优先使用 Tailwind CSS，项目不存在则使用 SCSS/LESS/CSS Modules；

## React

### 组件模板

```typescript
// 组件属性使用接口声明
interface MyComponentProps {prop1: string; prop2: number;}
// 使用箭头函数组件和命名导出；
export const MyComponent: React.FC<MyComponentProps> = (props: MyComponentProps) => {
  // 组件属性使用 `props` 定义，组件内部使用解构赋值获取属性
  const { prop1, prop2 } = props;
  // 组件内部按功能逻辑块组织，最后返回 UI，通用功能逻辑放置于顶部
  // 通用功能逻辑
  // 功能逻辑块 1，2，3。。。
  return (<div></div>);
};
```

## 全局例外

- 工具链约定的文件夹和文件；
- 自动生成的文件夹和文件；
- 领域 skill 的优先级高于通用 skill；
