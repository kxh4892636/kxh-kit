---
name: front-code-style
description: |
  前端编码规范, 用于命名规范、代码规范、组件规范相关问题. 在执行 html/css/js/ts/react/vue 等前端开发任务时使用该 skill.
  关键词：前端、规范、前端任务、代码、组件、函数
---

# front-code-style

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

## 检查与修复

- 代码开发任务执行完成后, 必须执行代码检查和修复;
- 使用 pnpm lint:change 进行增量代码检查;
- 使用 pnpm format 或者 pnpm format:changed 进行修复;
- 使用 pnpm biome check <path> 和 pnpm biome check --write <path> 进行特定代码检查和修复;