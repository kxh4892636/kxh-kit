---
name: code-spec
description: 应用本仓库的代码规范；当编写、修改或审查代码时使用。
---

逐个核对本次触及的目录、文件、函数和外部边界；每条适用规则均已满足或命中「全局例外」时，规范检查完成。

## 目录层级

- 将 `/src` 视为`level-1`, 若 `/src` 不存在, 则视为项目根目录(`/`).
- 目录层级禁止超过 4 层目录, `/level-4` 下只能包含文件, 即 `/level-1/level-2/level-3/level-4/index.ts` .
- 一个目录下的文件数量不超过 13 个, 超过时根据领域合并为文件夹.

## 命名规范

- 文件夹和文件的名称使用 `kebab-case`;
- 文件夹和文件应按实际内容使用领域名称(如 `tab-group-state.ts`, `terminal-cleanup.ts`), 禁用 `helpers`, `utils`, `common`, `components`, `hooks` 等不传递信息, 易沦为杂物堆的泛化名称(如 `tabs-helpers.ts`, `terminal-utils.ts`). 若只能想到此类名称, 通常说明文件职责过多需拆分, 或应按函数的操作对象命名.
- `level-2` 允许使用 `libs`, `utils`, `config`, `components`, `hooks` 等泛化名称.

## 代码文件

- 单个文件不超过 987 行, 单个前端组件不超过 389 行, 单个函数不超过 144 行, 超过时重构, 优先按职责和复用边界进行重构;
- 默认使用命名导出/导入, 除非需要默认导出/导入;
- 注释只写说明性注释, 解释代码背后的原因, 约束, 取舍和风险; 禁止用注释复述代码正在做什么或如何执行; 注释使用中文; 增量代码, 存量改动代码按需补充注释(非测试代码).

## 风险边界

- 网络请求, SDK 调用, 文件系统等外部边界必须有错误处理.
- 外部边界数据默认不可信; 内部流转数据默认可信, 无须 schema/validator.
  - 客户端: 默认 HTTP 响应数据不可信, 递归使用 `?` 可选链(TypeScript), 避免空指针异常; 默认用户输入数据不可信, 使用项目 schema/validator.
  - 服务端: 默认 RPC/HTTP 请求数据不可信, 使用项目 schema/validator.

## 测试

- 测试文件与实现文件放置于同级目录, E2E 测试可以使用单独的 tests 目录;

## TS

- 函数使用箭头函数, 不使用普通函数, 函数参数和返回值必须有类型注解.
- 禁止使用 `enum`, 使用 `const = {} as const` 替代, 需要值联合类型时, 从 const 对象派生.
- 禁止使用 `any`, 确有无法收窄的数据类型, 使用 `type ISafeAny = any`.

## CSS

- 优先使用 Tailwind CSS, 不存在则使用 SCSS/LESS/CSS Modules;

## React

### 组件模板

```typescript
// 组件属性使用接口声明, 组件属性数量 <= 8 个, 超过重构组件
interface MyComponentProps {prop1: string; prop2: number;}
// 使用箭头函数组件和命名导出;
export const MyComponent: React.FC<MyComponentProps> = (props: MyComponentProps) => {
  // 组件属性使用 `props` 定义,组件内部使用解构赋值获取属性
  const { prop1, prop2 } = props;
  // 组件内部按功能逻辑块组织,最后返回 UI,通用功能逻辑放置于顶部
  return (<Component />);
};
```

## 全局例外

- 工具链约定的文件夹和文件;
- 自动生成的文件夹和文件;
- 领域 skill 的优先级高于该 skill;
